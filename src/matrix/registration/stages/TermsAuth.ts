/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import {BaseRegistrationStage} from "./BaseRegistrationStage";

export class TermsAuth extends BaseRegistrationStage {

    async complete() {
        const { username, password, initialDeviceDisplayName, inhibitLogin } = this._registrationData;
        const response = await this._hsApi.register(username, password, initialDeviceDisplayName, {
            session: this._session,
            type: this.type
        }, inhibitLogin).response();
        return this.parseResponse(response);
    }

    get type(): string {
        return "m.login.terms";
    }

    // todo: add better parsing logic here, also remember that server admins can
    // require any sort documents here, even those that are not toc/privacy policies
    get privacyPolicy() {
        return this._params?.policies["privacy_policy"];
    }
}