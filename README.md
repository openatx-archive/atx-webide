## Intro
Web-based visual editor for generating atx testcase.

## Dependency
- atx (https://pypi.python.org/pypi/atx/)
- futures (https://pypi.python.org/pypi/futures/)
- tornado (https://pypi.python.org/pypi/tornado/)

## Installation
```bash
$ git clone https://github.com/openatx/atx-webide
$ pip install -e atx-webide
```

##Features
1. what you see is what you get
2. autocompletion of atx keywords & Python
3. crop screen as images to operation by **atx**
4. convenient operations on codes, files & images
5. to be continued

## Usage
```
$ python -m atxweb
```
![screenshot](docs/screenshot.png)

It will start the server and open the web browser. Just do as follows:

1. choose & connect device,
2. edit your code in web-editor,
3. click **刷新** to refresh screen, click **运行/运行到本行** to run/run step,
4. draw rect on screen and click **保存选区** to save cropped screen region,
5. **Coding** tab shows the code editing, **Images** tab shows the cropped images,
6. when running, output will be show at **console**,
7. click **保存** to save the workspace (actually changes will be saved when changing tabs, so it's not nessesary most of time).

Have Fun!

## Refs
1. [ATX (AutomatorX)](https://github.com/codeskyblue/AutomatorX)
2. [How to test BoomBeach with atx (@testerhome)](https://testerhome.com/topics/5923)
