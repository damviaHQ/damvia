#!/usr/bin/env bash
# Checks that docs/ is consistent with the code. Run from anywhere; no dependencies beyond grep/sed.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
fail=0

echo "1. Frontmatter: title, description, sidebar.order, lastUpdated on every public page"
while IFS= read -r f; do
  head=$(sed -n '1,15p' "$f")
  for field in '^title:' '^description:' '^  order:' '^lastUpdated: [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}'; do
    if ! grep -q "$field" <<<"$head"; then
      echo "   MISSING $field in ${f#$ROOT/}"; fail=1
    fi
  done
done < <(find "$DOCS" -name '*.md' -not -name 'README.md' -not -path "$DOCS/_internal/*" -not -name '_*')

echo "2. Env vars used in server/src and client/src are listed in docs/reference/environment-variables.md"
ENV_DOC="$DOCS/reference/environment-variables.md"
vars=$( { grep -rhoE 'process\.env\.[A-Z0-9_]+' "$ROOT/server/src" "$ROOT/client" --include='*.ts' --include='*.js' --exclude-dir=node_modules --exclude-dir=dist | sed 's/process\.env\.//'; \
          grep -rhoE 'import\.meta\.env\.[A-Z0-9_]+' "$ROOT/client/src" | sed 's/import\.meta\.env\.//'; } | sort -u)
for v in $vars; do
  if ! grep -q "\`$v\`" "$ENV_DOC"; then echo "   MISSING env var $v"; fail=1; fi
done

echo "3. Queues in server/src/worker.ts are listed in docs/reference/background-jobs.md"
JOBS_DOC="$DOCS/reference/background-jobs.md"
queues=$(grep -oE "name: '[^']+'" "$ROOT/server/src/worker.ts" | sed "s/name: '//; s/'//" | sort -u)
for q in $queues; do
  if ! grep -q "\`$q\`" "$JOBS_DOC"; then echo "   MISSING queue $q"; fail=1; fi
done

echo "4. Relative links between docs resolve"
while IFS= read -r f; do
  dir=$(dirname "$f")
  for link in $(grep -oE '\]\((\.\.?/[^)#]+)' "$f" | sed 's/](//'); do
    if [ ! -e "$dir/$link" ]; then echo "   BROKEN ${f#$ROOT/} -> $link"; fail=1; fi
  done
done < <(find "$DOCS" -name '*.md' -not -name 'README.md' -not -path "$DOCS/_internal/*")

echo "5. Frontmatter values containing a colon are quoted (YAML)"
while IFS= read -r f; do
  if sed -n '2,12p' "$f" | grep -qE '^(title|description): [^"].*: '; then echo "   UNQUOTED colon in title/description of ${f#$ROOT/}"; fail=1; fi
done < <(find "$DOCS" -name '*.md' -not -name 'README.md' -not -path "$DOCS/_internal/*")

if [ "$fail" -eq 0 ]; then echo "OK"; fi
exit $fail
