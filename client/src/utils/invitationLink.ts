/* Damvia - Open Source Digital Asset Manager
Copyright (C) 2024  Arnaud DE SAINT JEAN
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
// An invitation link opens the collection and pre-fills the sign-in by email
// link for the invited address. It carries no credential: the guest still
// proves the address by opening the email the sign-in sends.
export function invitationLink(origin: string, collectionPath: string, invitation: { email: string, collectionId: string, collectionName: string }) {
  const url = new URL(collectionPath, origin)
  url.search = new URLSearchParams({
    auth_params: window.btoa(JSON.stringify({ magicLink: true, email: invitation.email, collectionName: invitation.collectionName, collectionId: invitation.collectionId })),
  }).toString()
  url.hash = ''
  return url.toString()
}
