#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import argparse

def exec_file(filename):
    cur_file = os.path.basename(os.path.abspath(__file__))
    def _trace(frame, event, arg_unused):
        basename = frame.f_code.co_filename
        if cur_file == "trace_python2.py" and basename[-len(filename):] == filename:
            print "$$lineno: %s" % (frame.f_lineno)
        return _trace
    sys.settrace(_trace)
    exec open(filename) in {}
    sys.settrace(None)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('-f', '--filename', required=True, help='file to execute')
    args = ap.parse_args()
    exec_file(args.filename)