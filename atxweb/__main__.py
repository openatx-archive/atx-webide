#! /usr/bin/env python
#-*- encoding: utf-8 -*-

import argparse

from atxweb import server

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-H', '--host', required=False, help='Android adb host')
    ap.add_argument('-P', '--port', required=False, help='Android adb port')
    ap.add_argument('-s', '--serial', '--udid', required=False, help='Android serial or iOS unid')
    ap.add_argument('--ios', action='store_true', help='use iOS device')
    ap.add_argument('web_port', nargs='?', default=None, help='server port for webide')

    args = ap.parse_args()

    platform = args.ios and 'ios' or 'android'
    server.run(args.web_port, args.host, args.port, args.serial, platform)

if __name__ == '__main__':
    main()