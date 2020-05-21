import { LOG_BUCKET_NAME_ENV_KEY, DEFAULT_LOG_BUCKET_NAME } from './constants';
import * as zlib from 'zlib';
import  { S3 } from 'aws-sdk';

const bucketName = process.env[LOG_BUCKET_NAME_ENV_KEY] || DEFAULT_LOG_BUCKET_NAME;

export const handler = async function (event: any = {}) : Promise <any> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const s3UploadPromises: any[] = [];

  event.Records.forEach(async (record: any) => {
    const parsedData = parseCloudWatchLogEvent(record.kinesis.data);
    console.log('Parsed event data');
    console.log(parsedData);
    const { owner, logGroup, logStream, subscriptionFilters, logEvents } = parsedData;

    console.log('Received event from CloudWatch logs');
    console.log({ owner, logGroup, logStream, subscriptionFilters });

    const logEventsFailedToParse: any[] = [];
    const parsedLogEvents: any[] = [];
    logEvents.forEach(function(logEvent: any) {
      try {
        parsedLogEvents.push(parseLambdaLogEvent(logEvent));
      } catch (e) {
        logEventsFailedToParse.push({ error: e, logEvent });
      }
    });

    console.log('Parsed Log Events:');
    console.log(parsedLogEvents);

    console.log('Log events that failed to be parsed:');
    console.log(logEventsFailedToParse);

    const logEventsGroupedByRequestId: { [key: string]: any } = {};

    for (const parsedLogEvent of parsedLogEvents) {
      if (!logEventsGroupedByRequestId[parsedLogEvent.reqID]) {
        logEventsGroupedByRequestId[parsedLogEvent.reqID] = [];
      }

      logEventsGroupedByRequestId[parsedLogEvent.reqID].push(parsedLogEvent);
    }

    console.log('Grouped log events by Id:');
    console.log(logEventsGroupedByRequestId);

    const s3 = new S3();

    for (const [requestId, logEvents] of Object.entries(logEventsGroupedByRequestId)) {
      console.log(requestId, logEvents);
      if (requestId) {
        const logGroupSplit = logGroup.split('/');
        const logGroupCanonicalName = logGroupSplit[logGroupSplit.length - 1];
        const request: S3.PutObjectRequest = {
          Bucket: bucketName,
          Key: `${logGroupCanonicalName}/${requestId}.json`,
          Body: JSON.stringify({ requestId: logEvents }, null, 2),
          ContentType: 'application/json; charset=utf-8',
        };

        s3UploadPromises.push(s3.putObject(request).promise());
      }
    }
  });

  return Promise.all(s3UploadPromises);
};

function parseCloudWatchLogEvent(data: any) {
  const payload = Buffer.from(data, 'base64');
  const unzippedPayload = zlib.gunzipSync(payload).toString('utf8');
  const parsed = JSON.parse(unzippedPayload);

  return parsed;
}

function parseLambdaLogEvent(event: any) {
  const { message, timestamp, eventId } = event;
  console.log('Processing lambda log event', message, timestamp, eventId);
  const msg = message.trim();

  if (msg.startsWith('START')) {
    const reqID = msg.match(/RequestId: (.{36})/)[1];
    const version = msg.match(/Version: (.*?)$/)[1];

    return { timestamp, type: 'start', version, reqID };
  } else if (msg.startsWith('END')) {
    const reqID = msg.match(/RequestId: (.{36})/)[1];

    return { timestamp, type: 'end', reqID };
  } else if (msg.startsWith('REPORT')) {
    const reqID = msg.match(/RequestId: (.{36})/)[1];

    return { timestamp, type: 'report', reqID, msg };
  }

  const splitted = msg.split('\t');
  const reqID = splitted[1];
  const text = msg.split(`${reqID}\t`)[1];

  return {
    timestamp,
    type: 'log',
    msg: text,
    level: splitted[2],
    reqID: reqID == 'undefined' ? '' : reqID,
    eventID: event.eventId,
  };
}
