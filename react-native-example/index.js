/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {registerGlobals} from 'react-native-webrtc';
registerGlobals();

AppRegistry.registerComponent(appName, () => App);
