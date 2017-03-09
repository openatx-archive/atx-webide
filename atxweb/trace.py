#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import argparse

def _trace(frame, event, arg_unused):
    if os and os.path.basename(os.path.abspath(__file__)) == "trace.py":
        print "lineno: %s" % (frame.f_lineno)
        return _trace


def exec_file(filename):
    sys.settrace(_trace)
    exec open(filename) in {}
    sys.settrace(None)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('-f', '--filename', required=True, help='file to execute')
    args = ap.parse_args()
    exec_file(args.filename)