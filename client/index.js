var UPLOADS_BUCKET_NAME = 'clickarino-uploads';
var BUCKET_REGION = 'ap-southeast-2';
var IDENTITY_POOL_ID = 'ap-southeast-2:95798f07-66e2-4b68-9b13-9d3a4f985dfd';
var IOT_HOST = 'ak4y3bhc8ktbp.iot.ap-southeast-2.amazonaws.com';

var AWSIoTData = require('aws-iot-device-sdk');

AWS.config.update({
    region: BUCKET_REGION,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IDENTITY_POOL_ID
    })
});

var clientId = 'clickarino-' + (Math.floor((Math.random() * 100000) + 1));

// Create the AWS IoT device object.  Note that the credentials must be 
// initialized with empty strings; when we successfully authenticate to
// the Cognito Identity Pool, the credentials will be dynamically updated.
const mqttClient = AWSIoTData.device({
    
       // Set the AWS region we will operate in.
       region: AWS.config.region,
    
       // Set the AWS IoT Host Endpoint
       host: IOT_HOST,
    
       // Use the clientId created earlier.
       clientId: clientId,
    
       // Connect via secure WebSocket
       protocol: 'wss',
       //
       // Set the maximum reconnect time to 8 seconds; this is a browser application
       // so we don't want to leave the user waiting too long for reconnection after
       // re-connecting to the network/re-opening their laptop/etc...
       maximumReconnectTimeMs: 8000,
    
       // Enable console debugging information (optional)
       debug: false,
    
       // IMPORTANT: the AWS access key ID, secret key, and sesion token must be 
       // initialized with empty strings.
       accessKeyId: '',
       secretKey: '',
       sessionToken: ''
});


var cognitoIdentity = new AWS.CognitoIdentity();
AWS.config.credentials.get(function(err, data) {
   if (!err) {
        console.log('Retrieved identity: ' + AWS.config.credentials.identityId);
        var params = {
            IdentityId: AWS.config.credentials.identityId
        };
        cognitoIdentity.getCredentialsForIdentity(params, function(err, data) {
            if (!err) {
                // Update our latest AWS credentials; the MQTT client will use these
                // during its next reconnect attempt.
                mqttClient.updateWebSocketCredentials(
                    data.Credentials.AccessKeyId,
                    data.Credentials.SecretKey,
                    data.Credentials.SessionToken
                );
            } else {
                console.log('Error retrieving credentials: ' + err);
            }
        });
    } else {
        console.log('Error retrieving identity:' + err);
    }
});

window.saveFile = function (url) {
    console.log("creating download element");
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";

    a.href = url;
    a.click();
};

// Connect handler
window.mqttClientConnectHandler = function() {
    console.log('connect');
    mqttClient.subscribe('ap-southeast-2:627265be-4e99-4292-9b25-2e96f08af0db');
 };
 
 // Reconnect handler
 window.mqttClientReconnectHandler = function() {
    //console.log('reconnect');
 };

window.onStartedDownload = function(id) {
    console.log(`Started downloading: ${id}`);
}
  
window.onFailed = function(id) {
    console.log(`Download failed: ${error}`);
}

// Message handler
 window.mqttClientMessageHandler = function(topic, pload) {
    var payload = JSON.parse(pload);
    if (payload.hasOwnProperty('Bucket') && payload.hasOwnProperty('Key')) {
        console.log("downloading click");
        var params = { Bucket: payload.Bucket, Key: payload.Key}
        var url = s3.getSignedUrl('getObject', params);
        saveFile(url);
    } else if (payload.hasOwnProperty('Message')) {
        var messageList = document.getElementById("messages");
        var messageElement = document.createElement("li");
        var textNode = document.createTextNode(payload.Message);
        messageElement.appendChild(textNode);
        messageList.appendChild(messageElement);
    } else {
        console.log(payload);
    }
 };

mqttClient.on('connect', window.mqttClientConnectHandler);
mqttClient.on('reconnect', window.mqttClientReconnectHandler);
mqttClient.on('message', window.mqttClientMessageHandler);

var s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    params: { Bucket: UPLOADS_BUCKET_NAME }
});

window.uploadTrack = function() {
    var identityId = AWS.config.credentials.identityId;

    var files = document.getElementById('file').files;
    if (!files.length) {
      return alert('Please choose a file to upload first.');
    }
    console.log("uploading track");
    var file = files[0];
    var fileName = file.name;
  
    s3.upload({
        Key: fileName,
        Body: file,
        Metadata: {
            "IdentityId": identityId
        }
    }, function(err, data) {
        if (err) {
            return alert('There was an error uploading your track: ', err.message);
        }
        alert('Successfully uploaded your track.');
    });
}