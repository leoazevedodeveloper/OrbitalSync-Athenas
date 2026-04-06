import io from 'socket.io-client';
import { BACKEND_ORIGIN } from '../constants/appConfig';

export const socket = io(BACKEND_ORIGIN);
