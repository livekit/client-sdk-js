# JavaScript/TypeScript client SDK for LiveKit

## Demo

test/sample.ts contains a demo webapp that uses the SDK. To run it, do

`yarn sample`

## Access Token

In order to connect to a room, you need to first create an access token.
Access tokens are JWT tokens that contain information about the authorization. LiveKit tokens include the room and participant name, and should be created for each participant that joins the room.

Access tokens can be created with livekit-cli, that came with the server, or other LiveKit server SDKs.

```
./bin/livekit-cli create-token --join --r <room_name> --p <participant_name>
```

You still need to create the room on the server separately, token encapsulates only permission to access the room.
