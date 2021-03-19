/* eslint-disable react-native/no-inline-styles */
/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * Generated with the TypeScript template
 * https://github.com/react-native-community/react-native-template-typescript
 *
 * @format
 */

import {registerGlobals} from 'react-native-webrtc';
registerGlobals();

import {
  Room,
  connect as lkConnect,
  LogLevel,
  RoomEvent,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
} from 'livekit-client';
import React, {useCallback, useRef, useState} from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import {Colors, Header} from 'react-native/Libraries/NewAppScreen';

const Section: React.FC<{
  title: string;
}> = ({children, title}) => {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <View style={styles.sectionContainer}>
      <Text
        style={[
          styles.sectionTitle,
          {
            color: isDarkMode ? Colors.white : Colors.black,
          },
        ]}>
        {title}
      </Text>
      <Text
        style={[
          styles.sectionDescription,
          {
            color: isDarkMode ? Colors.light : Colors.dark,
          },
        ]}>
        {children}
      </Text>
    </View>
  );
};

const App = () => {
  const [serverUrl, setServerUrl] = useState(
    'wss://livespot-video-livekit-server.zeet-80590c7.zeet.app:443',
  );

  const [token, setToken] = useState(
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2aWRlbyI6eyJyb29tIjoiZmVlMDY3NzYtMDg4YS00MjcyLTlkMzAtMDI5NmIwZjg0NDdiIiwicm9vbUFkbWluIjpmYWxzZSwicm9vbUpvaW4iOnRydWV9LCJtZXRhZGF0YSI6eyJyb2xlIjoiZ3Vlc3QiLCJlbWFpbCI6IiJ9LCJpYXQiOjE2MTYxODg1NDYsIm5iZiI6MTYxNjE4ODU0NiwiZXhwIjoxNjE2MjAyOTQ2LCJpc3MiOiJ0ZXN0IiwianRpIjoibG9nZ2VkLW91dC11c2VyIn0.CRx8_9FSvM7YV6lzegrgu29nn35pwTx6Afz_1PmKxjQ',
  );

  const [events, setEvents] = useState<string[]>([]);

  const room = useRef<Room>();

  const [connectedUsers, setConnectedUsers] = useState<string[]>([]);

  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  const addEvent = useCallback((ev: string) => {
    setEvents(prev => [...prev, ev]);
  }, []);

  const ParticipantConnected = useCallback(
    (part: RemoteParticipant) => {
      console.log('ParticipantConnected', part);
      addEvent(`(ParticipantConnected): ${part.identity}`);
    },
    [addEvent],
  );

  const ParticipantDisconnected = useCallback(
    (part: RemoteParticipant) => {
      console.log('ParticipantDisconnected', part);

      addEvent(`(ParticipantDisconnected): ${part.identity}`);
    },
    [addEvent],
  );

  const OnTrackSubscribed = useCallback(
    (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      console.log('onTrackSubscribed', track, publication, participant);
      if (!participant) {
        console.error(
          'got remote stream but no participant',
          track,
          publication,
        );
        return;
      }
      if (!participant.identity) {
        console.error(
          'got remote stream but no participant.identity',
          participant,
        );
        return;
      }
    },
    [],
  );

  const OnTrackPublished = useCallback(
    (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('onTrackPublished', publication, participant);

      addEvent(
        `(TrackPublished): track=${publication.track} | trackSid=${publication.trackSid} | participantId=${participant.identity}`,
      );
    },
    [addEvent],
  );

  const connect = useCallback(async () => {
    if (room.current !== undefined) {
      return;
    }

    addEvent('Connecting to server...');

    // For some reason we need to set this because some method checks for userAgent which is usually null
    (navigator as any).userAgent = 'ios';

    try {
      const r = await lkConnect(serverUrl, token, {
        logLevel: LogLevel.trace,
      });

      room.current = r;

      const currentParticipants = Array.from(r.participants).map(
        p => p[1].identity,
      );
      addEvent(`Current participants: ${currentParticipants.join(', ')}`);
      setConnectedUsers(currentParticipants);

      r.on(RoomEvent.ParticipantConnected, ParticipantConnected);
      r.on(RoomEvent.ParticipantDisconnected, ParticipantDisconnected);
      r.on(RoomEvent.TrackPublished, OnTrackPublished);
      r.on(RoomEvent.TrackSubscribed, OnTrackSubscribed);

      addEvent('Connected!');
    } catch (err) {
      console.error(err);
      addEvent(`Failed to connect: ${err}`);
    }
  }, [
    OnTrackSubscribed,
    ParticipantConnected,
    ParticipantDisconnected,
    addEvent,
    serverUrl,
    token,
  ]);

  const disconnect = useCallback(async () => {
    room.current?.disconnect();
    room.current = undefined;
  }, []);

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={backgroundStyle}>
        <View
          style={{
            backgroundColor: isDarkMode ? Colors.black : Colors.white,
            flexDirection: 'column',
          }}>
          <Section title="Livekit Test">
            <Text>Setup Your Connection</Text>
          </Section>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: 'grey',
            }}>
            <Text>Server URL:</Text>
            <TextInput
              style={{
                width: '90%',
                height: 50,
                borderColor: 'yellow',
                borderWidth: 1,
              }}
              onChangeText={setServerUrl}
              value={serverUrl}
              editable={true}
            />

            <Text>Token</Text>
            <TextInput
              style={{
                width: '90%',
                height: 50,
                borderColor: 'yellow',
                borderWidth: 1,
              }}
              onChangeText={setToken}
              value={token}
              editable={true}
            />

            <Button
              title={room.current === undefined ? 'Connect' : 'Disconnect'}
              onPress={room.current === undefined ? connect : disconnect}
            />
          </View>

          <View
            style={{
              flexDirection: 'column',
            }}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 25,
              }}>
              Events
            </Text>
            {events.map((e, index) => {
              return (
                <Text
                  style={{
                    padding: 5,
                    borderColor: 'green',
                    borderWidth: 1,
                  }}
                  key={index}>
                  {e}
                </Text>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  highlight: {
    fontWeight: '700',
  },
});

export default App;
