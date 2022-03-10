/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

export interface MediaDevices {
    // filter out audiooutput
    enumerate(): Promise<MediaDeviceInfo[]>;
    // to assign to a video element, we downcast to WrappedTrack and use the stream property. 
    getMediaTracks(audio: true | MediaDeviceInfo, video: boolean | MediaDeviceInfo): Promise<Track[]>;
    getScreenShareTrack(): Promise<Track | undefined>;
}

export enum TrackType {
    ScreenShare,
    Camera,
    Microphone,
}

export interface Track {
    get type(): TrackType;
    get label(): string;
    get id(): string;
    get streamId(): string;
    get settings(): MediaTrackSettings;
    get muted(): boolean;
    setMuted(muted: boolean): void;
    stop(): void;
}

export interface AudioTrack extends Track {
    get isSpeaking(): boolean;
}

