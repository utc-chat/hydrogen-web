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

import {Track, TrackType} from "./MediaDevices";
import {SDPStreamMetadataPurpose} from "../../matrix/calls/callEventTypes";

export interface WebRTC {
    createPeerConnection(handler: PeerConnectionHandler): PeerConnection;
}

export interface PeerConnectionHandler {
    onIceConnectionStateChange(state: RTCIceConnectionState);
    onLocalIceCandidate(candidate: RTCIceCandidate);
    onIceGatheringStateChange(state: RTCIceGatheringState);
    onRemoteTracksChanged(tracks: Track[]);
    onDataChannelChanged(dataChannel: DataChannel | undefined);
    onNegotiationNeeded();
    // request the type of incoming stream
    getPurposeForStreamId(streamId: string): SDPStreamMetadataPurpose;
}
// does it make sense to wrap this?
export interface DataChannel {
    close();
    send();
}

export interface PeerConnection {
    notifyStreamPurposeChanged(): void;
    get remoteTracks(): Track[];
    get dataChannel(): DataChannel | undefined;
    get iceGatheringState(): RTCIceGatheringState;
    get localDescription(): RTCSessionDescription | undefined;
    createOffer(): Promise<RTCSessionDescriptionInit>;
    createAnswer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(description?: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidate): Promise<void>;
    addTrack(track: Track): void;
    removeTrack(track: Track): boolean;
    replaceTrack(oldTrack: Track, newTrack: Track): Promise<boolean>;
    createDataChannel(): DataChannel;
    dispose(): void;
}
