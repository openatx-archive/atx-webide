#-*- encoding: utf-8 -*-

import os
import functools
import sys
import logging
import webbrowser
import socket
import subprocess
import time
import json
import traceback
import locale
import re
import imp
import importlib

import cv2
import tornado.ioloop
import tornado.web
import tornado.websocket
from tornado.concurrent import run_on_executor
from concurrent.futures import ThreadPoolExecutor   # `pip install futures` for python2

try:
    import atx
except:
    print "AutomatorX not installed! Please run `pip install --upgrade atx`"
    sys.exit(1)

from atx import logutils
from atx import imutils
from atx import base
from atx.adbkit.client import Client as AdbClient

mod_ext = None

__dir__ = os.path.dirname(os.path.abspath(__file__))
log = logutils.getLogger("webide", level=logging.DEBUG)
log.setLevel(logging.DEBUG)


IMAGE_PATH = ['.', 'imgs', 'images']
SERVER_FILE = ['__init__.py', '__main__.py', '__tmp.py', 'server.py']
screen_crop_folder = {}
device = None
atx_settings = {}
latest_screen = ''
pythonLibMethods = {}


def read_file(filename, default=''):
    if not os.path.isfile(filename):
        return default
    with open(filename, 'rb') as f:
        return f.read()

def write_file(filename, content):
    with open(filename, 'w') as f:
        f.write(content.encode('utf-8'))

def get_valid_port():
    for port in range(10010, 10100):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        if result != 0:
            return port
    raise SystemError("Can not find a unused port, amazing!")


class FakeStdout(object):
    def __init__(self, fn=sys.stdout.write):
        self._fn = fn

    def write(self, s):
        self._fn(s)

    def flush(self):
        pass


class ImageHandler(tornado.web.RequestHandler):
    def get(self):
        imgs = base.list_images(path=IMAGE_PATH)
        images = []
        screenshots = []
        for name in imgs:
            realpath = name.replace('\\', '/') # fix for windows
            name = os.path.basename(name).split('@')[0]
            if realpath.startswith('screenshots/'):
                screenshots.append([name, realpath])
            else:
                images.append([name, realpath])
        self.write({
            'images': images,
            'screenshots': screenshots,
            'baseURL': self.request.protocol + '://' + self.request.host+'/static_imgs/'
        })

    def delete(self):
        imgpath = self.get_argument('imgpath')
        imgpath = os.path.abspath(os.path.join('.', imgpath))
        try:
            os.remove(imgpath)
            print 'deleted', imgpath
        except (IOError, WindowsError):
            self.set_status(404)
            self.write('Image (%s) Not Found' % imgpath)
            self.finish()

class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.render('index.html')

    def post(self):
        print self.get_argument('xml_text')
        self.write("Good")


class DebugWebSocket(tornado.websocket.WebSocketHandler):
    executor = ThreadPoolExecutor(max_workers=1)

    def open(self):
        log.info("WebSocket connected")
        self.write_message({'type': 'open'})
        self._run = False
        self._proc = None

    def write_console(self, text):
        self.write_message({'type': 'console', 'output': text})

    @run_on_executor
    def run_python_code(self, code):
        self.write_message({'type': 'run', 'status': 'running'})
        filename = '__tmp.py'
        with open(filename, 'wb') as f:
            f.write(code.encode('utf-8'))

        env = os.environ.copy()
        print atx_settings
        env['SERIAL'] = atx_settings.get('device_url', '')
        start_time = time.time()
        self._proc = subprocess.Popen(['python', '-u', filename],
            bufsize=1,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT)
        for line in iter(self._proc.stdout.readline, b''):
            self.write_console(line)

        exit_code = self._proc.wait()
        print("Return: %d" % exit_code)
        cost_time = time.time() - start_time
        self.write_console("[Finished in %.1fs, exit code %d]\n" % (cost_time, exit_code))
        self.write_message({'type': 'run', 'status': 'ready', 'notify': '运行结束'})

    @tornado.gen.coroutine
    def on_message(self, message_text):
        message = None
        try:
            message = json.loads(message_text)
        except:
            print 'Invalid message from browser:', message_text
            return
        command = message.get('command')

        if command == 'refresh':
            imgs = base.list_images(path=IMAGE_PATH)
            images = []
            screenshots = []
            for name in imgs:
                realpath = name.replace('\\', '/') # fix for windows
                if realpath.startswith('./'):
                    realpath = realpath[2:]
                directory = os.path.dirname(name)
                name = os.path.basename(name).split('@')[0]
                if realpath.startswith('screenshots/'):
                    screenshots.append({
                        'name': name,
                        'path': realpath
                    })
                else:
                    images.append({
                        'name': name,
                        'path': realpath,
                        'screen_crop_folder': directory,
                        'hash': '{}'.format(os.path.getmtime(realpath)).replace('.', '-')
                    })
            self.write_message({
                'type': 'image_list', 
                'images': images, 
                'screenshots': screenshots, 
                'latest': latest_screen
            })
        elif command == 'stop':
            if self._proc:
                self._proc.terminate()
            self.write_message({'type': 'run', 'notify': '停止中'})
        elif command == 'run':
            self.write_message({'type': 'run', 'notify': '开始运行'})
            code = message.get('code')
            yield self.run_python_code(code)
        else:
            self.write_message(u"You said: " + message)

    def on_close(self):
        log.info("WebSocket closed")

    def check_origin(self, origin):
        return True

class ManualCodeHandler(tornado.web.RequestHandler):

    def post(self):
        filename = self.get_argument('filename').encode(locale.getpreferredencoding(), 'ignore')
        if self.get_argument('option') == 'create':
            if not os.path.exists(filename + '.py'):
                try:
                    f = open(filename + '.py', 'a')
                    default = '\n'.join([
                        '# -*- encoding: utf-8 -*-',
                        '#',
                        '# Created on: %s\n\n' % time.ctime(),
                        'import os',
                        'import atx\n\n',
                        'd = atx.connect(os.getenv("SERIAL"))',
                    ])
                    f.write(default)
                    self.write({'status': 'ok', 'msg': 'success'})
                except Exception, e:
                    log.error('error in create code file: ', e)
                    self.write({'status': 'error', 'msg': 'error'})
            else:
                self.write({'status': 'ok', 'msg': 'already exists'})
        elif self.get_argument('option') == 'save':
            log.info('Save manual code')
            python_text = self.get_argument('python_text')
            write_file(filename, python_text)
        elif self.get_argument('option') == 'load':
            ret = {}
            default = '\n'.join([
                '# -*- encoding: utf-8 -*-',
                '#',
                '# Created on: %s\n\n' % time.ctime(),
                'import os',
                'import atx\n\n',
                'd = atx.connect(os.getenv("SERIAL"))',
            ])
            ret['man_text'] = read_file(filename, default=default)
            if not os.path.isfile(filename):
                write_file(filename, default)
            ret['code_file'] = []
            global SERVER_FILE
            for f in os.listdir('.'):
                if f not in SERVER_FILE and f.endswith('.py') and f != 'manual.py':
                    ret['code_file'].append(f)
            self.write(ret)
        else:
            log.info(self.get_argument('option'))


class ScreenCropFolderHandler(tornado.web.RequestHandler):

    def get(self):
        if self.request.remote_ip not in screen_crop_folder:
            screen_crop_folder[self.request.remote_ip] = '.'
        self.write(screen_crop_folder.get(self.request.remote_ip))

    def post(self):
        foldername = self.get_argument('foldername')
        if foldername:
            if not os.path.exists(foldername):
                try:
                    os.makedirs(foldername)
                except Exception, e:
                    print 'error in create image folder: ', e
                    return
            screen_crop_folder[self.request.remote_ip] = foldername
            global IMAGE_PATH
            if foldername not in IMAGE_PATH:
                IMAGE_PATH.append(foldername)
            self.write({'status': 'ok'})
            return

class ScreenshotHandler(tornado.web.RequestHandler):

    def get(self):
        global device
        if device is None:
            raise RuntimeError('No Device!')
        v = self.get_argument('v')
        global latest_screen
        latest_screen = 'screenshots/screen_%s.png' % v
        device.screenshot(latest_screen)

        self.set_header('Content-Type', 'image/png')
        with open(latest_screen, 'rb') as f:
            while 1:
                data = f.read(16000)
                if not data:
                    break
                self.write(data)
        self.finish()

    def post(self):
        screenname = self.get_argument('screenname')
        filename = self.get_argument('filename').encode(locale.getpreferredencoding(), 'ignore')
        bound = self.get_arguments('bound[]')
        l, t, r, b = map(int, bound)
        image = imutils.open(screenname)
        image = imutils.crop(image, l, t, r, b)
        if self.request.remote_ip not in screen_crop_folder:
            screen_crop_folder[self.request.remote_ip] = '.'
        cv2.imwrite(os.path.join(screen_crop_folder[self.request.remote_ip], filename), image)
        self.write({'status': 'ok'})

class DeviceHandler(tornado.web.RequestHandler):

    def get(self):
        '''get device list'''
        global device
        try:
            d = AdbClient().devices().keys()
            print 'android device list:', d
        except EnvironmentError as e:
            print 'ERROR:', str(e)
            d = []
        self.write({'android': d, 'ios': [], 'serial': 'todo'}) #device and device.serial})

    def post(self):
        '''connect device'''
        global device, atx_settings
        serial = self.get_argument('serial').strip()

        # check if device is alive, should be in drivers?
        if device is not None:
            if hasattr(device, 'serial') and serial == device.serial:
                if device.serial.startswith('http://'):
                    self.write({'status': 'ok'})
                    return
                elif AdbClient().devices().get(serial) == 'device':
                    self.write({'status': 'ok'})
                    return

        # wrapping args, should be in drivers? identifier?
        settings = {}
        atx_settings['device_url'] = serial.encode('utf-8') # used in set env-var SERIAL
        if serial.startswith('http://'):
            settings['platform'] = platform = 'ios'
            settings['device_url'] = serial
        else:
            settings['platform'] = platform = 'android'
            settings['serialno'] = serial

        # (re)connect
        device = atx.connect(**settings)
        if platform == 'ios':
            info = device.status()
            setattr(device, 'serial', serial)
        else:
            info = device.info
        self.write({'status': 'ok', 'info': info})

class ConsoleHandler(tornado.web.RequestHandler):

    def post(self):
        code = self.get_argument('code')
        filename = self.get_argument('filename').encode(locale.getpreferredencoding(), 'ignore')
        with open (filename+'.log', 'w') as f:
            f.write(code)
        self.write({'status': 'ok'})

class AutoCompleteHandler(tornado.web.RequestHandler):

    def get(self):
        language = self.get_argument('language')
        if language == 'python':
            if not pythonLibMethods:
                pythonLibs = ['os', 're', 'atx', 'time']
                for name in pythonLibs:
                    if name not in pythonLibMethods:
                        pythonLibMethods[name] = []
                    dirs = dir(importlib.import_module(name))
                    for method in dirs:
                        if not method.startswith("_") and method[0].islower():
                            pythonLibMethods[name].append(method)
            self.write(pythonLibMethods)

class StaticFileHandler(tornado.web.StaticFileHandler):
    def get(self, path=None, include_body=True):
        path = path.encode(base.SYSTEM_ENCODING) # fix for windows
        return super(StaticFileHandler, self).get(path, include_body)


def make_app(settings={}):
    static_path = os.getcwd()
    application = tornado.web.Application([
        (r"/", MainHandler),
        (r'/ws', DebugWebSocket), # code debug
        (r"/manual_code", ManualCodeHandler), # save and write py code
        (r"/images/screenshot", ScreenshotHandler),
        (r"/images/screencropfolder", ScreenCropFolderHandler),
        (r'/api/images', ImageHandler),
        (r'/device', DeviceHandler),
        (r'/static_imgs/(.*)', StaticFileHandler, {'path': static_path}),
        (r'/console/log', ConsoleHandler),
        (r'/autocomplete', AutoCompleteHandler),
    ], **settings)
    return application


def run(web_port=None, host=None, port=None, serial=None, platform="android", open_browser=True, workdir='.'):
    os.chdir(workdir)

    global IMAGE_PATH
    if not os.path.exists('screenshots'):
        os.makedirs('screenshots')
    else:
        # cleanup unused screenshots
        if os.path.exists('blockly.py'):
            screen_pat = re.compile('screenshots/screen_.*\.png')
            used_screens = screen_pat.findall(open('blockly.py').read())
            for s in os.listdir('screenshots'):
                if 'screenshots/%s' % s not in used_screens:
                    os.remove('screenshots/%s' % s)

    IMAGE_PATH.append('screenshots')

    application = make_app({
        'static_path': os.path.join(__dir__, 'static'),
        'template_path': os.path.join(__dir__, 'static'),
        'debug': True,
    })
    if not web_port:
        web_port = get_valid_port()

    global atx_settings
    atx_settings['platform'] = platform
    if platform == 'ios':
        atx_settings['device_url'] = serial
    else:
        atx_settings['host'] = host
        atx_settings['port'] = port
        atx_settings['serialno'] = serial

    if open_browser:
        url = 'http://127.0.0.1:{}'.format(web_port)
        webbrowser.open(url, new=2) # 2: open new tab if possible

    application.listen(web_port)
    log.info("Server started.")
    log.info("Listening port on 127.0.0.1:{}".format(web_port))
    tornado.ioloop.IOLoop.instance().start()


def hook_check_file(f):
    @functools.wraps(f)
    def _f(modify_times, path):
        if path in _ignored_files:
            return
        f(modify_times, path)
    _f._ignored_files = _ignored_files = set()
    return _f

if __name__ == '__main__':
    if len(sys.argv) > 1:
        serial = sys.argv[1]
        if serial.startswith('http://'):
            platform = 'ios'
        else:
            platform = 'android'
        run(serial, platform=platform)
    else:
        run()
