# Message Broadcast

A simple service to broadcast messages across all of connected sessions using AWS WebSocket API.

## Quick start

- Install dependencies and deploy.

```bash
yarn # Install dependencies
SERVICE_NAME=broadcaster yarn deploy # Deploy it into AWS
```

- Test using [`wscat`](https://www.npmjs.com/package/wscat).

```bash
$ wscat -c "your-endpoint"
connected (press CTRL+C to quit)
> hi there
< {"data":"hi there","_now":1561016329388,"_me":true}
> {"type":"act","payload":"left"}
< {"type":"act","payload":"left","_now":1561016357649,"_me":true}
>
```

## Rationale

Now, it is time to decide that we build up something special such as a small game or service for proof of concept. There is a very boring job for this. That is a job to add a server to communicate between each clients.

When we need to communicate a very simple message such as a position of character and a small chat message, we should write server codes to bind, accept a connection from a client, manage a list of connections and broadcast a message to all of them. And we should run a new server, deploy it, watch its health and use our energy to make it operate as normal. Moreover, its cost can be high if we didn't shutdown properly.

We don't want it even if we need it. So we prepare a very simple broadcast backend without management.

## System

We build up very simple broadcast backend using AWS WebSocket API and Amazon DynamoDB.

### Why Serverless

We don't want to concern about this backend in management and costs manner. We want to pay as only we go and keep it simple than a container like Docker.

### Why AWS

When we prepare this backend, `AWS WebSocketAPI` is the only serverless solution that supports WebSocket properly.

### How many AWS components it uses

It is built on many of AWS components.

- It uses `API Gateway` and `Lambda` for WebSocket and broadcasting logic.
- It uses `DynamoDB` to manage all of connectionIds.
- It uses `CloudWatch` to write all console logs to it.
- It uses `CloudFormation` and IAM to deploy this stack and manage proper roles.

### Message

For convenience, the system adds `_me` and `_now` when it forwards the message.

- `_me` is `true` only if a receiver is a sender.
- `_now` is a unix timestamp(milliseconds) that reached at the backend.

#### Plain text

If you send a plain text, it will be placed at `.data`.

```json
{
  "data": "a text you sent",
  "_me": true,
  "_now": 156101632938
}
```

#### JSON

If you send a json object, `_me` and `_now` will be added into that object.

```json
{
  // ...yourObject
  "_me": true,
  "_now": 156101632938
}
```

## Development

- It uses [`NodeJS 8.10`](https://aws.amazon.com/ko/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/) and [`Serverless framework`](https://serverless.com/).
- It manages some secure variables via environment variable using [direnv](https://github.com/direnv/direnv). Please see `.envrc.example` file.
- It is written by [`TypeScript`](https://www.typescriptlang.org/) and [`Visual Studio Code`](https://code.visualstudio.com/).

## Deployment

First, [please set AWS credentials properly.](https://serverless-stack.com/chapters/configure-the-aws-cli.html)

And then, set `.envrc` file properly using `.envrc.example` file. Of course, that file should be sourced by `direnv` or your direct command like `source .envrc`.

All things are ready. Just type like this.

```bash
yarn deploy
```

If you don't want to use `direnv` and `.envrc`, you can use `SERVICE_NAME` environment variable instead. But this name is referenced in both of the name of CloudFormation stack and the name of DynamoDB Table, so you should set this value very carefully. Both of naming rules are different, for example, CloudFormation allows `-` character but DynamoDB doesn't. I recommend this way if you want to use only one word as a service name.

```bash
SERVICE_NAME=broadcaster yarn deploy
```

## Test

After deployment, or if you run `yarn sls info` command, you can retrieve the information of deployed backend like this.

```text
...omitted...
api keys:
  None
endpoints:
  wss://0000000000.execute-api.aws-region-code.amazonaws.com/your-stage
functions:
...omitted...
```

[You can test the WebSocket easily using wscat.](https://docs.aws.amazon.com/en_us/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-wscat.html)

```bash
npm i -g wscat
wscat -c "wss://0000000000.execute-api.aws-region-code.amazonaws.com/your-stage"
```

And send a plain text or a json.

```bash
$ wscat -c "your-endpoint"
connected (press CTRL+C to quit)
> hi there
< {"data":"hi there","_now":1561016329388,"_me":true}
> {"type":"act","payload":"left"}
< {"type":"act","payload":"left","_now":1561016357649,"_me":true}
>
```

## Troubleshooting

### Error on NodeJS 10

It is written by NodeJS 8 so please use NodeJS 8.1x runtime. Otherwise, for example, if you use NodeJS 10 runtime on your development environment you can see a stacktrace like below one while developing or deploying.

```text
npm ls -prod -json -depth=1 failed with code 1
internal/modules/cjs/loader.js:584
    throw err;
    ^

Error: Cannot find module '../lib/utils/unsupported.js'
    at Function.Module._resolveFilename (internal/modules/cjs/loader.js:582:15)
    at Function.Module._load (internal/modules/cjs/loader.js:508:25)
```

### Insufficient AWS privileges

If you give the Administrator privileges to your AWS account, it will be never happened but if not so, you can see some error messages like below due to insufficient AWS privileges.

```text
not authorized to perform: cloudformation:DescribeStacks on resource: arn:aws:cloudformation:aws-region:account-id:stack/your-stack-name/*

not authorized to perform: logs:DescribeLogGroups on resource: arn:aws:logs:aws-region:account-id:log-group::log-stream: (Service: AWSLogs; Status Code: 400; Error Code: AccessDeniedException; Request ID: guid).
```

Please check your AWS profile has proper privileges for these systems. This IAM role can help you. It is tough but smaller than Administrator.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DeployServerlessWithDynamoDB",
      "Effect": "Allow",
      "Action": [
        "iam:*",
        "apigateway:*",
        "cloudwatch:*",
        "logs:*",
        "lambda:*",
        "dynamodb:*",
        "cloudformation:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS

If you fail to deploy the system, CloudFormation performs a rollback to the last deployed system so that the system will function normally. That stage is `UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS`. You have to wait for this step to finish. After that, you can deploy new one normally.

```text
Stack:arn:aws:cloudformation:aws-region:account-id:stack/your-stack-name/event-id is in UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS state and can not be updated.
```

## Limitation

This is really no function because it focuses on simplicity. If you like this and you want a bound to broadcast, like topic, please check [`message-topic`](https://github.com/yingyeothon/message-topic), too.

## License

MIT
