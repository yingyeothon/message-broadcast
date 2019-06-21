import { APIGatewayProxyHandler } from "aws-lambda";
import * as AWS from "aws-sdk";
import install from "./apigatewaymanagementapi";

import "source-map-support/register";

install(AWS);

const connectionTableName = process.env.CONNECTION_TABLE_NAME!;
const apiPath = process.env.API_PATH || "";
const ddb = new AWS.DynamoDB();

export const connect: APIGatewayProxyHandler = async event => {
  try {
    await ddb
      .putItem({
        TableName: connectionTableName,
        Item: {
          connectionId: { S: event.requestContext.connectionId }
        }
      })
      .promise();
    return {
      statusCode: 200,
      body: "OK"
    };
  } catch (error) {
    console.error(`Cannot update connection table`, error);
    return {
      statusCode: 500,
      body: "Failed to connect"
    };
  }
};

const deleteConnection = (connectionId: string) =>
  ddb
    .deleteItem({
      TableName: connectionTableName,
      Key: {
        connectionId: { S: connectionId }
      }
    })
    .promise();

export const disconnect: APIGatewayProxyHandler = async event => {
  try {
    await deleteConnection(event.requestContext.connectionId);
    return {
      statusCode: 200,
      body: "OK"
    };
  } catch (error) {
    console.error(`Cannot update connection table`, error);
    return {
      statusCode: 500,
      body: "Failed to disconnect"
    };
  }
};

export const broadcast: APIGatewayProxyHandler = async event => {
  // Step 1. Prepare data strings.
  const data = (() => {
    try {
      const data = JSON.parse(event.body);
      return typeof data === "object" ? data : { data };
    } catch (error) {
      console.error(`InvalidJSON`, event.body, error);
      return { data: event.body };
    }
  })();
  const now = Date.now();
  const dataForMe = JSON.stringify({ ...data, _now: now, _me: true });
  const dataForOthers = JSON.stringify({ ...data, _now: now, _me: false });

  // Step 2. Read all connection ids from DynamoDB.
  const dbResult = await ddb
    .scan({
      TableName: connectionTableName,
      ProjectionExpression: "connectionId"
    })
    .promise();
  console.log(`result`, dbResult);
  if (!dbResult.Items) {
    console.log(`There is no items`);
    return { statusCode: 200, body: "OK" };
  }

  // Step 3. Prepare ApiGatewayManagementApi client.
  const apiEndpoint =
    event.requestContext.domainName +
    "/" +
    (apiPath || event.requestContext.stage);
  const apimgmt = new AWS.ApiGatewayManagementApi({
    apiVersion: "2018-11-29",
    endpoint: apiEndpoint
  });

  // Step 4. Send a message to all of peers.
  const promises = dbResult.Items.map(async ({ connectionId }) => {
    console.log(`item`, connectionId);
    if (!connectionId) {
      console.log(`item is invalid`);
      return;
    }
    if (!connectionId.S) {
      return;
    }
    try {
      // Step 4-1. Send `dataForMe` if it is me, otherwise, `dataForOther`.
      const me = event.requestContext.connectionId === connectionId.S;
      const reply = me ? dataForMe : dataForOthers;
      console.log(`Send a data into a connection`, connectionId, reply);
      await apimgmt
        .postToConnection({
          ConnectionId: connectionId.S,
          Data: reply
        })
        .promise();
    } catch (postError) {
      // Step 4-2. Delete a connection from DynamoDB if it is broken.
      console.error(
        `Error while post a data via a connection`,
        apiEndpoint,
        connectionId,
        postError
      );
      try {
        await deleteConnection(connectionId.S);
      } catch (deleteError) {
        console.error(
          `Error while deleting a connection`,
          connectionId,
          deleteError
        );
      }
    }
  });

  // Step 5. Wait all promises to complete all of sending jobs.
  try {
    await Promise.all(promises);
  } catch (promiseError) {
    console.log(`Error while broadcasting`, promiseError);
    return { statusCode: 500, body: promiseError.stack };
  }
  return {
    statusCode: 200,
    body: "OK"
  };
};
