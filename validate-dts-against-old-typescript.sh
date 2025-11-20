#!/bin/bash

TYPESCRIPT_VERSION=${1:-"4.8"}

echo "# Performing clean build of livekit-client library..."
pnpm build:clean

echo "# Instantiating dts-validation working directory..."
rm -rf dts-validation
mkdir dts-validation
cd dts-validation

pnpm init
pnpm install typescript@${TYPESCRIPT_VERSION}
pnpm install ../

echo "import 'livekit-client';" > index.ts
cat <<EOF > tsconfig.json
{
  "compilerOptions": {
    "types": ["sdp-transform", "ua-parser-js", "events", "dom-mediacapture-record"],
    "target": "ES2015" /* Specify ECMAScript target version: 'ES3' (default), 'ES5', 'ES2015', 'ES2016', 'ES2017', 'ES2018', 'ES2019', 'ES2020', or 'ESNEXT'. */,
    "module": "ES2020" /* Specify module code generation: 'none', 'commonjs', 'amd', 'system', 'umd', 'es2015', 'es2020', or 'ESNext'. */,
    "lib": [
      "DOM",
      "DOM.Iterable",
      "ES2017",
      "ES2018.Promise",
      "ES2021.WeakRef"
    ],
    "rootDir": "./",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true /* Enable all strict type-checking options. */,
    "esModuleInterop": true /* Enables emit interoperability between CommonJS and ES Modules via creation of namespace objects for all imports. Implies 'allowSyntheticDefaultImports'. */,
    "skipLibCheck": true /* Skip type checking of declaration files. */,
    "noUnusedLocals": true,
    "forceConsistentCasingInFileNames": true /* Disallow inconsistently-cased references to the same file. */,
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "include": ["index.ts"]
}
EOF

echo "# Running tsc against dts-validation working directory..."
npx tsc
result="$?"

if [[ "${result}" -eq "0" ]]; then
  echo "# tsc ran successfully against demo typescript ${TYPESCRIPT_VERSION} project, PASS!"
else
  echo "# tsc errored when ran against demo typescript ${TYPESCRIPT_VERSION} project, FAIL!"
fi

exit ${result}
