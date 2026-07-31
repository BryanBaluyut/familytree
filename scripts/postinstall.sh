#!/bin/sh
# Apply our patches (see patches/) to third-party packages.
#
# Self-healing: on a CI build cache (e.g. Netlify) node_modules is restored
# from the PREVIOUS build, where an older version of a patch was already
# applied. patch-package then can't apply the current patch on top of those
# already-modified files and hard-fails. When that happens, reinstall the
# pristine package and apply the patch to clean files.
#
# The version below must match the patch filename (patches/relatives-tree+<v>.patch)
# and the version pinned in package-lock.json.
set -e

# --error-on-fail: patch-package exits 0 on failure outside CI, which would
# silently skip the healing below.
if ! patch-package --error-on-fail; then
  echo "patch-package failed — reinstalling pristine relatives-tree and retrying"
  rm -rf node_modules/relatives-tree
  npm install relatives-tree@3.2.2 --no-save --ignore-scripts --no-audit --no-fund
  patch-package --error-on-fail
fi
