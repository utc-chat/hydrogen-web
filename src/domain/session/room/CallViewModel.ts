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

import {ViewModel, Options as BaseOptions} from "../../ViewModel";
import type {GroupCall} from "../../../matrix/calls/group/GroupCall";
import type {Member} from "../../../matrix/calls/group/Member";
import type {BaseObservableList} from "../../../observable/list/BaseObservableList";
import type {Track} from "../../../platform/types/MediaDevices";

type Options = BaseOptions & {call: GroupCall};

export class CallViewModel extends ViewModel<Options> {
   
    public readonly memberViewModels: BaseObservableList<CallMemberViewModel>;

    constructor(options: Options) {
        super(options);
        this.memberViewModels = this.getOption("call").members
            .mapValues(member => new CallMemberViewModel(this.childOptions({member})))
            .sortValues((a, b) => a.compare(b));
    }

    get name(): string {
        return this.getOption("call").name;
    }

    get id(): string {
        return this.getOption("call").id;
    }

    get localTracks(): Track[] {
        console.log("localTracks", this.getOption("call").localMedia);
        return this.getOption("call").localMedia?.tracks ?? [];
    }
}

type MemberOptions = BaseOptions & {member: Member};

export class CallMemberViewModel extends ViewModel<MemberOptions> {
    get tracks(): Track[] {
        return this.getOption("member").remoteTracks;
    }

    compare(other: CallMemberViewModel): number {
        const myUserId = this.getOption("member").member.userId;
        const otherUserId = other.getOption("member").member.userId;
        if(myUserId === otherUserId) {
            return 0;
        }
        return myUserId < otherUserId ? -1 : 1;
    }
}
