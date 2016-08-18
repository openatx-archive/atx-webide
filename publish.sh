#!/bin/bash -
#
#
set -eu
cd $(dirname $0)

# Sync to pypi
rm -rf ./dist
python setup.py sdist bdist_wheel

mv atx_webide.egg-info/PKG-INFO dist/
rm -rf ./atx_webide.egg-info
rm -rf ./build

echo 'uploading..'
twine upload dist/atx-webide* --config-file=.pypirc

echo 'Fixing PKG-INFO..'
echo 'Requires-Dist: futures (==3.0.5)' >> dist/PKG-INFO
echo 'Requires-Dist: tornado (==4.3)' >> dist/PKG-INFO
echo 'Requires-Dist: atx (>=1.0.13)' >> dist/PKG-INFO
echo 'Upload PKG-INFO at: https://pypi.python.org/pypi?%3Aaction=submit_form'
