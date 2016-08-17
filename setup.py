#!/usr/bin/env python
# coding: utf-8
#
# Licensed under Apache 2.0
#

import os
import setuptools

os.environ['SKIP_GENERATE_AUTHORS'] = '1'
os.environ['SKIP_WRITE_GIT_CHANGELOG'] = '0'

dist = setuptools.setup(setup_requires=['pbr'], pbr=True)