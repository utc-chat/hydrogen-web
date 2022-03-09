/*
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>
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

import {MediaDevices as IMediaDevices, TrackType, Track, AudioTrack} from "../../types/MediaDevices";

const POLLING_INTERVAL = 200; // ms
export const SPEAKING_THRESHOLD = -60; // dB
const SPEAKING_SAMPLE_COUNT = 8; // samples

class MediaDevicesWrapper implements IMediaDevices {
    constructor(private readonly mediaDevices: MediaDevices) {}

    enumerate(): Promise<MediaDeviceInfo[]> {
        return this.mediaDevices.enumerateDevices();
    }

    async getMediaTracks(audio: true | MediaDeviceInfo, video: boolean | MediaDeviceInfo): Promise<Track[]> {
        const stream = await this.mediaDevices.getUserMedia(this.getUserMediaContraints(audio, video));
        const tracks = stream.getTracks().map(t => {
            const type = t.kind === "audio" ? TrackType.Microphone : TrackType.Camera;
            return wrapTrack(t, stream, type);
        });
        return tracks;
    }

    async getScreenShareTrack(): Promise<Track | undefined> {
        const stream = await this.mediaDevices.getDisplayMedia(this.getScreenshareContraints());
        const videoTrack = stream.getTracks().find(t => t.kind === "video");
        if (videoTrack) {
            return wrapTrack(videoTrack, stream, TrackType.ScreenShare);
        }
        return;
    }

    private getUserMediaContraints(audio: boolean | MediaDeviceInfo, video: boolean | MediaDeviceInfo): MediaStreamConstraints {
        const isWebkit = !!navigator["webkitGetUserMedia"];

        return {
            audio: audio
                ? {
                    deviceId: typeof audio !== "boolean" ? { ideal: audio.deviceId } : undefined,
                }
                : false,
            video: video
                ? {
                    deviceId: typeof video !== "boolean" ? { ideal: video.deviceId } : undefined,
                    /* We want 640x360.  Chrome will give it only if we ask exactly,
                   FF refuses entirely if we ask exactly, so have to ask for ideal
                   instead
                   XXX: Is this still true?
                 */
                    width: isWebkit ? { exact: 640 } : { ideal: 640 },
                    height: isWebkit ? { exact: 360 } : { ideal: 360 },
                }
                : false,
        };
    }

    private getScreenshareContraints(): DisplayMediaStreamConstraints {
        return {
            audio: false,
            video: true,
        };
    }
}

export function wrapTrack(track: MediaStreamTrack, stream: MediaStream, type: TrackType) {
    if (track.kind === "audio") {
        return new AudioTrackWrapper(track, stream, type);
    } else {
        return new TrackWrapper(track, stream, type);
    }
}

export class TrackWrapper implements Track {
    constructor(
        public readonly track: MediaStreamTrack,
        public readonly stream: MediaStream,
        public readonly type: TrackType
    ) {}

    get label(): string { return this.track.label; }
    get id(): string { return this.track.id; }
    get streamId(): string { return this.stream.id; }
    get muted(): boolean { return this.track.muted; }

    setMuted(muted: boolean): void {
        this.track.enabled = !muted;
    }
}

export class AudioTrackWrapper extends TrackWrapper {
    private measuringVolumeActivity = false;
    private audioContext?: AudioContext;
    private analyser: AnalyserNode;
    private frequencyBinCount: Float32Array;
    private speakingThreshold = SPEAKING_THRESHOLD;
    private speaking = false;
    private volumeLooperTimeout: number;
    private speakingVolumeSamples: number[];

    constructor(track: MediaStreamTrack, stream: MediaStream, type: TrackType) {
        super(track, stream, type);
        this.speakingVolumeSamples = new Array(SPEAKING_SAMPLE_COUNT).fill(-Infinity);
        this.initVolumeMeasuring();
        this.measureVolumeActivity(true);
    }

    get isSpeaking(): boolean { return this.speaking; }
    /**
     * Starts emitting volume_changed events where the emitter value is in decibels
     * @param enabled emit volume changes
     */
    private measureVolumeActivity(enabled: boolean): void {
        if (enabled) {
            if (!this.audioContext || !this.analyser || !this.frequencyBinCount) return;

            this.measuringVolumeActivity = true;
            this.volumeLooper();
        } else {
            this.measuringVolumeActivity = false;
            this.speakingVolumeSamples.fill(-Infinity);
            this.emit(CallFeedEvent.VolumeChanged, -Infinity);
        }
    }

    private initVolumeMeasuring(): void {
        const AudioContext = window.AudioContext || window["webkitAudioContext"] as undefined | typeof window.AudioContext;
        if (!AudioContext) return;

        this.audioContext = new AudioContext();

        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.1;

        const mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(this.stream);
        mediaStreamAudioSourceNode.connect(this.analyser);

        this.frequencyBinCount = new Float32Array(this.analyser.frequencyBinCount);
    }


    public setSpeakingThreshold(threshold: number) {
        this.speakingThreshold = threshold;
    }

    private volumeLooper = () => {
        if (!this.analyser) return;

        if (!this.measuringVolumeActivity) return;

        this.analyser.getFloatFrequencyData(this.frequencyBinCount);

        let maxVolume = -Infinity;
        for (let i = 0; i < this.frequencyBinCount.length; i++) {
            if (this.frequencyBinCount[i] > maxVolume) {
                maxVolume = this.frequencyBinCount[i];
            }
        }

        this.speakingVolumeSamples.shift();
        this.speakingVolumeSamples.push(maxVolume);

        this.emit(CallFeedEvent.VolumeChanged, maxVolume);

        let newSpeaking = false;

        for (let i = 0; i < this.speakingVolumeSamples.length; i++) {
            const volume = this.speakingVolumeSamples[i];

            if (volume > this.speakingThreshold) {
                newSpeaking = true;
                break;
            }
        }

        if (this.speaking !== newSpeaking) {
            this.speaking = newSpeaking;
            this.emit(CallFeedEvent.Speaking, this.speaking);
        }

        this.volumeLooperTimeout = setTimeout(this.volumeLooper, POLLING_INTERVAL) as unknown as number;
    };

    public dispose(): void {
        clearTimeout(this.volumeLooperTimeout);
    }
}

// export interface ICallFeedOpts {
//     client: MatrixClient;
//     roomId: string;
//     userId: string;
//     stream: MediaStream;
//     purpose: SDPStreamMetadataPurpose;
//     audioMuted: boolean;
//     videoMuted: boolean;
// }

// export enum CallFeedEvent {
//     NewStream = "new_stream",
//     MuteStateChanged = "mute_state_changed",
//     VolumeChanged = "volume_changed",
//     Speaking = "speaking",
// }

// export class CallFeed extends EventEmitter {
//     public stream: MediaStream;
//     public sdpMetadataStreamId: string;
//     public userId: string;
//     public purpose: SDPStreamMetadataPurpose;
//     public speakingVolumeSamples: number[];

//     private client: MatrixClient;
//     private roomId: string;
//     private audioMuted: boolean;
//     private videoMuted: boolean;
//     private measuringVolumeActivity = false;
//     private audioContext: AudioContext;
//     private analyser: AnalyserNode;
//     private frequencyBinCount: Float32Array;
//     private speakingThreshold = SPEAKING_THRESHOLD;
//     private speaking = false;
//     private volumeLooperTimeout: number;

//     constructor(opts: ICallFeedOpts) {
//         super();

//         this.client = opts.client;
//         this.roomId = opts.roomId;
//         this.userId = opts.userId;
//         this.purpose = opts.purpose;
//         this.audioMuted = opts.audioMuted;
//         this.videoMuted = opts.videoMuted;
//         this.speakingVolumeSamples = new Array(SPEAKING_SAMPLE_COUNT).fill(-Infinity);
//         this.sdpMetadataStreamId = opts.stream.id;

//         this.updateStream(null, opts.stream);

//         if (this.hasAudioTrack) {
//             this.initVolumeMeasuring();
//         }
//     }

//     private get hasAudioTrack(): boolean {
//         return this.stream.getAudioTracks().length > 0;
//     }

//     private updateStream(oldStream: MediaStream, newStream: MediaStream): void {
//         if (newStream === oldStream) return;

//         if (oldStream) {
//             oldStream.removeEventListener("addtrack", this.onAddTrack);
//             this.measureVolumeActivity(false);
//         }
//         if (newStream) {
//             this.stream = newStream;
//             newStream.addEventListener("addtrack", this.onAddTrack);

//             if (this.hasAudioTrack) {
//                 this.initVolumeMeasuring();
//             } else {
//                 this.measureVolumeActivity(false);
//             }
//         }

//         this.emit(CallFeedEvent.NewStream, this.stream);
//     }

//     private initVolumeMeasuring(): void {
//         const AudioContext = window.AudioContext || window.webkitAudioContext;
//         if (!this.hasAudioTrack || !AudioContext) return;

//         this.audioContext = new AudioContext();

//         this.analyser = this.audioContext.createAnalyser();
//         this.analyser.fftSize = 512;
//         this.analyser.smoothingTimeConstant = 0.1;

//         const mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(this.stream);
//         mediaStreamAudioSourceNode.connect(this.analyser);

//         this.frequencyBinCount = new Float32Array(this.analyser.frequencyBinCount);
//     }

//     private onAddTrack = (): void => {
//         this.emit(CallFeedEvent.NewStream, this.stream);
//     };

//     /**
//      * Returns callRoom member
//      * @returns member of the callRoom
//      */
//     public getMember(): RoomMember {
//         const callRoom = this.client.getRoom(this.roomId);
//         return callRoom.getMember(this.userId);
//     }

//     /**
//      * Returns true if CallFeed is local, otherwise returns false
//      * @returns {boolean} is local?
//      */
//     public isLocal(): boolean {
//         return this.userId === this.client.getUserId();
//     }

//     /**
//      * Returns true if audio is muted or if there are no audio
//      * tracks, otherwise returns false
//      * @returns {boolean} is audio muted?
//      */
//     public isAudioMuted(): boolean {
//         return this.stream.getAudioTracks().length === 0 || this.audioMuted;
//     }

//     *
//      * Returns true video is muted or if there are no video
//      * tracks, otherwise returns false
//      * @returns {boolean} is video muted?
     
//     public isVideoMuted(): boolean {
//         // We assume only one video track
//         return this.stream.getVideoTracks().length === 0 || this.videoMuted;
//     }

//     public isSpeaking(): boolean {
//         return this.speaking;
//     }

//     /**
//      * Replaces the current MediaStream with a new one.
//      * This method should be only used by MatrixCall.
//      * @param newStream new stream with which to replace the current one
//      */
//     public setNewStream(newStream: MediaStream): void {
//         this.updateStream(this.stream, newStream);
//     }

//     /**
//      * Set feed's internal audio mute state
//      * @param muted is the feed's audio muted?
//      */
//     public setAudioMuted(muted: boolean): void {
//         this.audioMuted = muted;
//         this.speakingVolumeSamples.fill(-Infinity);
//         this.emit(CallFeedEvent.MuteStateChanged, this.audioMuted, this.videoMuted);
//     }

//     /**
//      * Set feed's internal video mute state
//      * @param muted is the feed's video muted?
//      */
//     public setVideoMuted(muted: boolean): void {
//         this.videoMuted = muted;
//         this.emit(CallFeedEvent.MuteStateChanged, this.audioMuted, this.videoMuted);
//     }

//     /**
//      * Starts emitting volume_changed events where the emitter value is in decibels
//      * @param enabled emit volume changes
//      */
//     public measureVolumeActivity(enabled: boolean): void {
//         if (enabled) {
//             if (!this.audioContext || !this.analyser || !this.frequencyBinCount || !this.hasAudioTrack) return;

//             this.measuringVolumeActivity = true;
//             this.volumeLooper();
//         } else {
//             this.measuringVolumeActivity = false;
//             this.speakingVolumeSamples.fill(-Infinity);
//             this.emit(CallFeedEvent.VolumeChanged, -Infinity);
//         }
//     }

//     public setSpeakingThreshold(threshold: number) {
//         this.speakingThreshold = threshold;
//     }

//     private volumeLooper = () => {
//         if (!this.analyser) return;

//         if (!this.measuringVolumeActivity) return;

//         this.analyser.getFloatFrequencyData(this.frequencyBinCount);

//         let maxVolume = -Infinity;
//         for (let i = 0; i < this.frequencyBinCount.length; i++) {
//             if (this.frequencyBinCount[i] > maxVolume) {
//                 maxVolume = this.frequencyBinCount[i];
//             }
//         }

//         this.speakingVolumeSamples.shift();
//         this.speakingVolumeSamples.push(maxVolume);

//         this.emit(CallFeedEvent.VolumeChanged, maxVolume);

//         let newSpeaking = false;

//         for (let i = 0; i < this.speakingVolumeSamples.length; i++) {
//             const volume = this.speakingVolumeSamples[i];

//             if (volume > this.speakingThreshold) {
//                 newSpeaking = true;
//                 break;
//             }
//         }

//         if (this.speaking !== newSpeaking) {
//             this.speaking = newSpeaking;
//             this.emit(CallFeedEvent.Speaking, this.speaking);
//         }

//         this.volumeLooperTimeout = setTimeout(this.volumeLooper, POLLING_INTERVAL);
//     };

//     public clone(): CallFeed {
//         const mediaHandler = this.client.getMediaHandler();
//         const stream = this.stream.clone();

//         if (this.purpose === SDPStreamMetadataPurpose.Usermedia) {
//             mediaHandler.userMediaStreams.push(stream);
//         } else {
//             mediaHandler.screensharingStreams.push(stream);
//         }

//         return new CallFeed({
//             client: this.client,
//             roomId: this.roomId,
//             userId: this.userId,
//             stream,
//             purpose: this.purpose,
//             audioMuted: this.audioMuted,
//             videoMuted: this.videoMuted,
//         });
//     }

//     public dispose(): void {
//         clearTimeout(this.volumeLooperTimeout);
//         this.measureVolumeActivity(false);
//     }
// }
