## Intro
Web-based visual editor for generating atx testcase.

## Dependency
- AutomatorX
- futures
- tornado

## Installation
using pip:
```
$ pip install atx-webide
```

or clone this repository and run ```python setup.py install```
if you got 'TypeError: decoding Unicode is not supported' in easy_install,
run ```pip install -U setuptools``` first.

## Usage
```
$ python -m atxweb -h

usage: __main__.py [-h] [-H HOST] [-P PORT] [-s SERIAL] [--ios] [web_port]

positional arguments:
  web_port              server port for webide

optional arguments:
  -h, --help            show this help message and exit
  -H HOST, --host HOST  Android adb host
  -P PORT, --port PORT  Android adb port
  -s SERIAL, --serial SERIAL, --udid SERIAL
                        Android serial or iOS unid
  --ios                 use iOS device
```

## Refs
1. [ATX (AutomatorX)](https://github.com/codeskyblue/AutomatorX)
2. [atx-blockly](https://github.com/openatx/blockly)
