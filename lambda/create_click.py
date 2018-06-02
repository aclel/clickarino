''' This is a lambda function to create a click track
    when an audio file is uploaded to S3.

    1. Download the file from the clickarino-uploads bucket
    2. Get the cognito id from the S3 object metadata and connect to the topic
    3. Create the click track
    4. Upload the file to the clickarino-clicktracks bucket
    5. Send a message back to the client (via IoT) with the key for the file
'''
try:
  import unzip_requirements
except ImportError:
  pass

import os
import json
import shutil
import boto3
import librosa
import librosa.output
import mir_eval
import numpy as np
import urllib.parse

LAMBDA_TASK_ROOT = os.environ.get('LAMBDA_TASK_ROOT', os.path.dirname(os.path.abspath(__file__)))

# binaries are stored in ./bin
CURR_BIN_DIR = os.path.join(LAMBDA_TASK_ROOT, 'bin')

# binaries on lambda can only be executed from /tmp/bin
BIN_DIR = '/tmp/bin'
os.environ['PATH'] += ':' + BIN_DIR

CLICKTRACK_BUCKET_NAME = 'clickarino-userfiles-mobilehub-2127974803'

s3_client = boto3.client('s3')
iot_client = boto3.client('iot-data')


def main(event, context):
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']

        # metadata = s3_client.head_object(Bucket=bucket, Key=key)['Metadata']
        # cognito_identity_id = metadata['identityid']

        # payload = { 'Message': 'Firing up the clickarino' }
        # response = iot_client.publish(
        #     topic=cognito_identity_id,
        #     qos=1,
        #     payload=json.dumps(payload)
        # )

        filepath = os.path.join('/tmp', os.path.basename(key))
        s3_client.download_file(bucket, key, filepath)

        # payload = { 'Message': 'Clickifying the file...' }
        # response = iot_client.publish(
        #     topic=cognito_identity_id,
        #     qos=1,
        #     payload=json.dumps(payload)
        # )

        output_path = _create_click(filepath)

        # tags = {
        #     'IdentityId': cognito_identity_id
        # }
        # tag_set = urllib.parse.urlencode(tags)

        s3_client.put_object(
            Bucket=CLICKTRACK_BUCKET_NAME,
            Body=open(output_path, 'rb'),
            Key='public/click.wav',
            Metadata={
                'Content-Disposition': 'attachment; filename=click.wav;'
            },
            # Tagging=tag_set
        )

        # payload = { 'Message': 'Clickification complete - sending the file back to you now'}
        # response = iot_client.publish(
        #     topic=cognito_identity_id,
        #     qos=1,
        #     payload=json.dumps(payload)
        # )

        # payload = {
        #     'Bucket': CLICKTRACK_BUCKET_NAME,
        #     'Key': 'click.wav'
        # }
        # response = iot_client.publish(
        #     topic=cognito_identity_id,
        #     qos=1,
        #     payload=json.dumps(payload)
        # )


def _create_click(filepath):
    _init_bin('ffmpeg')

    # Load the file
    filename = os.path.basename(filepath)
    file_extension = filename.split('.')[1]
    y, sr = librosa.load(filepath)

    # Use the onset envelope to get the tempo and track the beats
    onset_env = librosa.onset.onset_strength(y, sr=sr, aggregate=np.median)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)

    # Get the times of the beats
    times = librosa.frames_to_time(beats)

    # Create a sound clip with a click at the beat times
    y_click = mir_eval.sonify.clicks(times, sr, length=len(y))

    # Write a wav file with the click overlayed on top of the track
    output_path = '/tmp/click.wav'
    librosa.output.write_wav(output_path, y + y_click, sr)

    return output_path


def _init_bin(executable_name):
    if not os.path.exists(BIN_DIR):
        os.makedirs(BIN_DIR)

    print('Moving binary {0} to {1}'.format(executable_name, BIN_DIR))
    binary_path = os.path.join(CURR_BIN_DIR, executable_name)
    new_path  = os.path.join(BIN_DIR, executable_name)
    shutil.copy2(binary_path, new_path)

    print('Giving {0} execution permissions'.format(executable_name))
    os.chmod(new_path, 0o775)