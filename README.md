# Guide
This is a package that allows easy creation of an effective log sink. The log sink infrastructure allows various log streams from different source aws accounts to be centralized to one account for processing. The workflow is the following:

1. Source Account log streams emit an event
1. Source Account log stream event is funnelled to a log stream destination created in the destination account
1. Log stream destination in the destination account is configured to funnel the event to a kinesis stream
1. A log processor lambda batch evaluates the log stream event and uploads the event to an S3 bucket in the destination account.

Glossary:
1. [Log group and log streams](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html)
1. [Cross account log data sharing (log destination)](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CrossAccountSubscriptions.html)

This package sets up the destination side of the overall infrastructure outlined in the tutorial above.
After deploying the resources in this package you should see the following
```
Outputs:
AwsLogSinkStack.logProcessorStreamDestinationArn = arn:aws:logs:<Region>:<Id>:destination:logProcessorStreamDestination
```

Using the output above(the destination arn), follow [instructions on the source side](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CreateSubscriptionFilter.html) to start funneling log stream events to the destination.

For simplification you can create a subscription with something like the following:
```
aws logs put-subscription-filter \
    --log-group-name "<Your Log Group Name>" \
    --filter-name "<Filter Name>" \
    --filter-pattern "" \
    --destination-arn "arn:aws:logs:<Region>:<Id>:destination:logProcessorStreamDestination"
```

# Prereq

Install CDK CLI by running:
```
npm i -g aws-cdk
```

Bootstrap first:
```
cdk bootstrap
```

Bootstrap creates another cloudformation stack to manage the s3 bucket for lambda assets (zip files)

# Commands

* `npm run build`   compile typescript to js
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
* `npm run deploy`  compile typescript to js and deploy the stack

Note: run `npm run build` before `cdk deploy` or `cdk synth` to have changes reflected.
To build and deploy, run `npm run deploy`

## Other commands
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests

## Customization

Define the following environment variables to properly create the stack:

### Required
SOURCE_ACCOUNTS - Comma separated list of account Ids that are allowed to create subscription filters for the kinesis destination. If this is not set, only the destination account is able to create the subscription filter with the destination.

ex: SOURCE_ACCOUNTS=111111111111,999999999999

### Optional
SHARD_COUNT (Default: 1) - Shard counts for the kinesis stream. Increase or decrease the count based on your traffic.

This is a good calculator for shard count: https://comcastsamples.github.io/KinesisShardCalculator/

Keep in mind the pricing: https://aws.amazon.com/kinesis/data-streams/pricing/

BUCKET_NAME (Default: 'processedlogsforasampleapp') - The bucket name to where the log processor will store the processed logs. Since S3 bucket names are global across all users and accounts it's likely your deployment will fail since the default name may have already been taken.

LOG_SINK_STACK_NAME (Default: 'AwsLogSinkStack') - The name of the stack with all the resources