#!/usr/bin/env bash
# Damvia - Open Source Digital Asset Manager
# Copyright (C) 2024  Arnaud DE SAINT JEAN
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Lists every source file that does not start with the AGPL header.
# Exits non-zero when at least one file is missing it.
set -euo pipefail

cd "$(dirname "$0")/.."

missing=0
while IFS= read -r -d '' file; do
  if ! head -n 20 "$file" | grep -q 'GNU Affero General Public License'; then
    echo "missing AGPL header: $file"
    missing=$((missing + 1))
  fi
done < <(find server/src server/test client/src client/test scripts \
  \( -name node_modules -o -name dist -o -path client/src/components/ui \) -prune -o \
  -type f \( -name '*.ts' -o -name '*.vue' -o -name '*.cjs' -o -name '*.js' -o -name '*.mjs' \) \
  -print0 | sort -z)

if [ "$missing" -gt 0 ]; then
  echo "$missing file(s) without the AGPL header. Copy the block from server/src/index.ts (use <!-- --> in .vue files)." >&2
  exit 1
fi
echo "All source files carry the AGPL header."
