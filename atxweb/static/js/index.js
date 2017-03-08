/* utils functions */
function notify(message, className, position, autoHideDelay, element) {
  className = className || 'info';
  position = position || 'top center';
  autoHideDelay = autoHideDelay || 1500;
  $.notify(message, { className, position, autoHideDelay });
}

Vue.filter('imagename', function(text) {
  return text; // text.replace(/(\.\d+x\d+)?\.png/, "");
});

Vue.component('tree-node', {
  template: '#tree-node-template',
  replace: true,
  props: {
    model: Object
  },
  data: function() {
    return {
      open: false
    }
  },
  computed: {
    isFolder: function() {
      return this.model.children &&
        this.model.children.length
    }
  },
  methods: {
    toggle: function() {
      if (this.isFolder) {
        this.open = !this.open
      }
    },
    changeType: function() {
      if (!this.isFolder) {
        Vue.set(this.model, 'children', [])
        this.addChild()
        this.open = true
      }
    },
    addChild: function() {
      this.model.children.push({
        name: 'new stuff'
      })
    },
    openContextMenu: function(evt) {
      evt.preventDefault();
      evt.stopPropagation();
    },
  }
});


/* Vue controls the layout */
Vue.config.delimiters = ['${', '}'];
var vm = new Vue({
  el: '#main-content',
  data: {
    tab: 'pythonManualDiv',
    // choose device
    choosing: false,
    android_serial_choices: [],
    android_serial: '',
    ios_url: 'http://localhost:8100',
    // device status
    device: {
      refreshing: false,
      platform: 'android',
      serial: '',
      latest_screen: '',
    },
    // layout controls
    layout: {
      width: 1, //document.documentElement.clientWidth,
      height: 1, //document.documentElement.clientHeight,
      right_portion: 25, // max: 55, min: 25
      screen_ratio: 1.75, // screen height/width
      screen_scale: 0.4, // canvas width / screen width
    },
    // screen
    screen: null,
    autorefresh: null,
    refreshing: true, // should set to false after refreshScreen
    images: [],
    // screen overlays
    overlays: {
      selected: null,
      crop_bounds: { bound: null }, // null
      click_point: {}, // atx_click
      rect_bounds: {}, // atx_click_image
      swipe_points: {} // atx_swipe
    },
    manual: {
      filename: 'manual.py',
      dirty: false,
      pythonText: '',
      vimmode: false,
      running: false,
      cursor: null,
      row_image: null,
      usedimages: null,
      contextmenu: {
        left: 0,
        top: 0,
        img: null
      },
      selected: 'manual.py',
      options: [
        { text: '默认', value: 'manual.py'}
      ]
    },
    resolution: {
      imgWidth: 0,
      imgHeight: 0,
      positionX: 0,
      positionY: 0,
      displayMessage: "0x0"
    },
    console: {
      code: null,
      filename: "console.log",
      display: true,
      editorHeight: 0,
      consoleHeight: 0
    },
    autocomplete: {
      pythonLibMethods: null
    }
  },
  computed: {
    canvas_width: function() {
      var margin = 30; // right 15 + left 15
      return (this.layout.width - 2 * margin) * this.layout.right_portion / 100.0 - margin;
    },
    canvas_height: function() {
      canvas.width = this.canvas_width;
      canvas.height = this.canvas_width * this.layout.screen_ratio;
      if (this.screen) {
        var ctx = canvas.getContext('2d');
        ctx.drawImage(this.screen, 0, 0, canvas.width, canvas.height);
        this.layout.screen_scale = this.canvas_width / this.screen.width;
      }
      return canvas.height;
    },
  },
  methods: {
    switchTab: function(which) {
      if (which == this.tab) {
        return;
      }
      if (which == 'pythonManualDiv' && pymaneditor) { pymaneditor.focus(); }
      this.tab = which;
    },
    getDeviceChoices: function() {
      var self = this;
      self.device.refreshing = true;
      $.ajax({
        url: '/device',
        method: 'GET',
        dataType: 'json',
        data: {
          platform: this.device.platform,
        },
        success: function(data) {
          if ('serial' in data) {
            self.choosing = false;
            self.device.serial = data.serial;
            self.device.refreshing = false;
            self.refreshScreen();
            return;
          }

          // clean old devices
          self.android_serial_choices.splice(0, self.android_serial_choices.length);
          for (var i = 0, s; i < data.android.length; i++) {
            s = data.android[i];
            self.android_serial_choices.push(s);
          }
          self.choosing = true;
          self.device.refreshing = false;
        },
        error: function(err) {
          notify('获取设备列表失败', 'error');
          console.log('获取设备列表失败:\n', err);
          self.device.refreshing = false;
        }
      });
    },
    connectDevice: function() {
      var serial = this.device.platform == 'ios' ? this.ios_url : this.android_serial;
      console.log("connecting", this.device.platform, serial);
      var self = this;
      $.ajax({
        url: '/device',
        method: 'POST',
        dataType: 'json',
        data: {
          serial: serial
        },
        success: function(data) {
          notify('连接成功, 刷新中..', 'success');
          self.choosing = false;
          self.refreshScreen();
        },
        error: function(err) {
          notify('连接失败', 'error');
          self.choosing = false;
        }
      });
    },
    cancelConnectDevice: function() {
      this.choosing = false;
    },
    openChooseDevice: function() {
      this.getDeviceChoices();
    },
    refreshScreen: function() {
      var url = '/images/screenshot?v=t' + new Date().getTime();
      this.loadScreen(url,
        function() {
          notify('Refresh Done.', 'success');
          ws.send(JSON.stringify({ command: "refresh" }));
        },
        function() { notify('Refresh Failed.', 'error'); }
      );
    },
    checkAutoRefreshScreen: function(evt) {
      var self = this,
        interval = 3;
      // ios need more time
      if (this.device.platform == 'ios') {
        interval = 5;
      }
      if (evt.target.checked) {
        notify('自动刷新频率为' + interval + '秒', 'warn');
        self.autorefresh = setInterval(function() {
          var url = '/images/screenshot?v=t' + new Date().getTime();
          console.log('get screen', url);
          self.loadScreen(url);
        }, interval * 1000);
      } else {
        if (self.autorefresh != null) {
          clearInterval(self.autorefresh);
        }
        self.autorefresh = null;
      }
    },
    loadScreen: function(url, callback, errback) {
      if (!url || (this.screen && url == this.screen.src)) {
        return;
      }
      var img = new Image(),
        self = this;
      self.refreshing = true;
      img.crossOrigin = 'anonymous';
      img.addEventListener('load', function() {
        self.layout.screen_ratio = img.height / img.width;
        self.resolution.imgWidth = img.width;
        self.resolution.imgHeight = img.height;
        self.resolution.displayMessage = img.width.toString() + 'x' + img.height.toString();
        self.refreshing = false;
        self.screen = img;
        if (callback) { callback(); }
      });
      img.addEventListener('error', function(err) {
        console.log('loadScreen Error:', err);
        self.refreshing = false;
        if (errback) { errback(err); }
      });
      img.src = url;
    },
    setScreenCropFolder: function () {
      var foldername = window.prompt('保存文件的目录名称，默认为项目根目录！');
      if (!foldername) {
        return;
      }
      var self = this;
      $.ajax({
        url: '/images/screencropfolder',
        method: 'POST',
        dataType: 'json',
        data: {
          foldername: foldername
        },
        success: function(res) {
          // console.log(res);
          notify('目录设置成功', 'success');
          ws.send(JSON.stringify({ command: "refresh" }));
        },
        error: function(err) {
          console.log('目录设置失败:\n', err);
          notify('目录设置失败，打开调试窗口查看具体问题', 'error');
        }
      });
    },
    saveScreenCrop: function() {
      if (this.device.latest_screen == '') {
        notify('图片列表尚未刷新!', 'warn');
        return;
      }
      var bound = this.overlays.crop_bounds.bound;
      if (bound === null) {
        notify('还没选择截图区域！', 'warn');
        return;
      }
      var filename = window.prompt('保存的文件名, 不需要输入.png扩展名');
      if (!filename) {
        return;
      }
      if (filename.substr(-4, 4) == '.png') {
        filename = filename.substr(0, filename.length - 4);
      }
      var w = this.screen.width,
        h = this.screen.height;
      filename = filename + '.' + Math.max(w, h) + 'x' + Math.min(w, h) + '.png';
      var self = this;
      $.ajax({
        url: '/images/screenshot',
        method: 'POST',
        dataType: 'json',
        data: {
          screenname: self.device.latest_screen,
          filename: filename,
          bound: bound,
        },
        success: function(res) {
          // console.log(res);
          notify('图片保存成功', 'success');
          ws.send(JSON.stringify({ command: "refresh" }));
          $('#screen-crop').css({ 'left': '0px', 'top': '0px', 'width': '0px', 'height': '0px' });
          self.overlays.crop_bounds.bound = null;
        },
        error: function(err) {
          console.log('图片保存失败:\n', err);
          notify('图片保存失败，打开调试窗口查看具体问题', 'error');
        },
      });
    },
    saveScreenCropRightClick: function(evt) {
      if (this.device.latest_screen == '' || this.overlays.crop_bounds.bound === null) {
        return;
      }
      evt.preventDefault()
      this.saveScreenCrop();
    },
    clearConsole: function() {
      $('pre.console').html('');
    },
    toggleConsole: function() {
      $('pre.console').toggle();
      if (this.console.display) {
        this.console.display = false;
      } else {
        this.console.display = true;
      }
    },
    downloadConsole: function () {
      var code = $('pre.console')[0].innerText;
      if (code == '') {
        notify('没有log!', 'warn');
        return;
      }
      var filename = window.prompt('保存的文件名, 不需要输入.log扩展名');
      if (!filename) {
        return;
      }
      if (filename.substr(-4, 4) == '.log') {
        filename = filename.substr(0, filename.length - 4);
      }
      var self = this;
      $.ajax({
        url: '/console/log',
        method: 'POST',
        dataType: 'json',
        data: {
          'code': code,
          'filename': filename
        },
        success: function(res) {
          notify('log保存成功', 'success');
        },
        error: function(err) {
          notify('log保存失败', 'error');
        }
      });
    },
    loadPythonCompletePattern: function (callback) {
      var self = this;
      self.device.refreshing = true;
      $.ajax({
        url: '/autocomplete',
        method: 'GET',
        dataType: 'json',
        data: {
          language: 'python'
        },
        success: function(data) {
          self.autocomplete.pythonLibMethods = data;
          if (callback) {
            callback();
          }
        },
        error: function(err) {
          notify('获取python自动补全数据失败', 'error');
        }
      });
    },
    runPyManualCode: function() {
      if (this.manual.dirty) { this.savePyManualCode(); }
      this.manual.running = true;
      var $console = $('pre.console');
      $console.text('');
      ws.send(JSON.stringify({ command: "run", code: this.manual.pythonText }));
    },
    runPyManualCodeToLine: function(line) {
      if (this.manual.running) {
        return;
      }
      var cursor = pymaneditor.getCursorPosition(),
        lines = pymaneditor.session.doc.getLines(0, cursor.row),
        char = pymaneditor.session.doc.getNewLineCharacter(),
        code = lines.join(char);
      this.manual.running = true;
      ws.send(JSON.stringify({ command: "run", code: code }));
    },
    stopPyManualCode: function() {
      ws.send(JSON.stringify({ command: "stop" }));
    },
    changeFileItem: function (rowId, event) {
      this.manual.selected = event.target.value;
      this.manual.filename = event.target.value;
      this.loadPyManualCode();
    },
    savePyManualCode: function() {
      if (!pymaneditor) {
        return;
      }
      this.manual.pythonText = pymaneditor.getValue();
      var self = this;
      $.ajax({
        url: '/manual_code',
        method: 'POST',
        data: {
          'option': 'save',
          'filename': self.manual.filename,
          'python_text': self.manual.pythonText
        },
        success: function(data) {
          notify('Code保存成功', 'success');
          self.manual.dirty = false;
        },
        error: function(e) {
          console.log('Code保存失败:', e);
          notify(e.responseTman || 'Code保存失败，请检查服务器连接是否正常', 'warn');
        },
      });
    },
    createCodeFile: function() {
      var filename = window.prompt('代码文件的名称！');
      if (!filename) {
        return;
      }
      if (filename.substr(-3, 3) == '.py') {
        filename = filename.substr(0, filename.length - 3);
      }
      var self = this;
      $.ajax({
        url: '/manual_code',
        method: 'POST',
        dataType: 'json',
        data: {
          'option': 'create',
          'filename': filename
        },
        success: function(res) {
          if (res.msg == 'success') {
            notify('新建文件成功', 'success');
          } else {
            notify('文件已经存在', 'already exists');
          }
          self.manual.filename = filename + '.py';
          self.manual.options.push({'text': '', 'value': filename + '.py'});
          ws.send(JSON.stringify({ command: "refresh" }));
        },
        error: function(err) {
          console.log('新建文件失败:\n', err);
          notify('新建文件失败，打开调试窗口查看具体问题', 'error');
        }
      });
    },
    loadPyManualCode: function() {
      if (!pymaneditor) {
        return;
      }
      var self = this;
      $.ajax({
        url: '/manual_code',
        method: 'POST',
        data: {
          'option': 'load',
          'filename': self.manual.filename
        },
        success: function (data) {
          notify('读取code数据', 'success');
          var code = data.man_text;
          pymaneditor.setValue(data.man_text);
          pymaneditor.clearSelection();

          if (data['code_file'] != null) {
            for (var f in data['code_file']) {
              var isExist = false;
              for (var l in self.manual.options) {
                if (self.manual.options[l].value == data['code_file'][f]) {
                  isExist = true;
                }
              }
              if (!isExist) {
                self.manual.options.push({'text': '', 'value': data['code_file'][f]});
              }
            }
          }
        },
        error: function(e) {
          console.log('Code加载失败:', e);
          notify(e.responseTman || 'Code加载失败，请检查服务器连接是否正常', 'warn');
        }
      });
    },
    toggleManualVimMode: function() {
      this.manual.vimmode = !this.manual.vimmode;
      if (this.manual.vimmode) {
        pymaneditor.setKeyboardHandler('ace/keyboard/vim');
      } else {
        pymaneditor.setKeyboardHandler();
      }
    },
    checkManualRowImage: function(text) {
      var regexp = /[^"]+\.png(?="|')/,
        m = regexp.exec(text);
      if (!m) {
        this.manual.row_image = null;
        return;
      }
      this.manual.row_image = m[0];
    },
    updateManualImageCursor: function() {
      var regexp = /[^"]+\.png(?="|')/;
      var lines = pymaneditor.session.doc.getAllLines();
      var usedimages = {};
      for (var i = 0, line; i < lines.length; i++) {
        line = lines[i];
        m = regexp.exec(line);
        if (m) {
          if (!usedimages[m[0]]) { usedimages[m[0]] = []; }
          usedimages[m[0]].push({ row: i, column: m.index });
        }
      }
      this.manual.usedimages = usedimages;
    },
    showContextMenu: function(evt, img) {
      this.manual.contextmenu.target = evt.target;
      this.manual.contextmenu.img = img;
      this.manual.contextmenu.left = evt.clientX + 2;
      this.manual.contextmenu.top = evt.clientY + 2;
    },
    hideContextMenu: function() {
      this.manual.contextmenu.img = null;
    },
    onMenuDelete: function() {
      if (!this.manual.contextmenu.img) {
        return;
      }
      var name = this.manual.contextmenu.img.name;
      if (this.manual.usedimages[name]) {
        notify('图片已被使用，无法删除！');
        this.manual.contextmenu.img = null;
        return;
      }
      var prefix = window.blocklyBaseURL.length;
      var imgpath = this.manual.contextmenu.img.path.substr(prefix);
      var idx = this.images.indexOf(this.manual.contextmenu.img);
      // locate idx in blocklyImageList
      for (var i = 0, info, blkidx = -1; i < window.blocklyImageList.length; i++) {
        info = window.blocklyImageList[i];
        if (info[1] == imgpath) {
          blkidx = i;
          break
        }
      }
      var self = this;
      $.ajax({
        url: '/api/images',
        method: 'DELETE',
        data: { 'imgpath': imgpath },
        success: function(data) {
          self.images.splice(idx, 1);
          if (blkidx != -1) {
            window.blocklyImageList.splice(blkidx, 1);
          }
          notify('删除成功', 'success');
        },
        error: function(e) {
          console.log('删除失败:\n', e);
          notify(e.responseText || '删除失败，请检查服务器连接是否正常', 'warn');
        },
      });
      this.manual.contextmenu.img = null;
    },
    onMenuInsertClickImage: function() {
      if (!this.manual.contextmenu.img) {
        return;
      }
      var cursor = pymaneditor.getCursorPosition();
      var line = pymaneditor.session.getLine(cursor.row);
      var filename = this.manual.contextmenu.img.name.replace(/(\.\d+x\d+)?\.png/, "@auto.png")
      var script = 'd.click_image(u"' + filename + '")\n';
      if (!/^\s*$/.test(line)) {
        script = line.match(/^\s*/)[0] + script;
        cursor = { row: cursor.row + 1, column: 0 };
      }
      pymaneditor.session.insert(cursor, script);
      pymaneditor.navigateTo(cursor.row, 0);
      this.manual.contextmenu.img = null;
    },
    onMenuInsertClickNowait: function() {
      if (!this.manual.contextmenu.img) {
        return;
      }
      var cursor = pymaneditor.getCursorPosition();
      var line = pymaneditor.session.getLine(cursor.row);
      var filename = this.manual.contextmenu.img.name.replace(/(\.\d+x\d+)?\.png/, "@auto.png")
      var script = 'd.click_nowait(u"' + filename + '")\n';
      if (!/^\s*$/.test(line)) {
        script = line.match(/^\s*/)[0] + script;
        cursor = { row: cursor.row + 1, column: 0 };
      }
      pymaneditor.session.insert(cursor, script);
      pymaneditor.navigateTo(cursor.row, 0);
      this.manual.contextmenu.img = null;
    },
    onMenuReplaceRowImage: function() {
      if (!this.manual.contextmenu.img || !this.manual.row_image) {
        return;
      }
      var row = this.manual.cursor.row;
      var text = pymaneditor.session.getLine(row);
      var regexp = /[^"]+\.png(?="|')/;
      var name = this.manual.contextmenu.img.name;
      text = text.replace(regexp, name);
      pymaneditor.session.doc.insertFullLines(row + 1, [text]);
      pymaneditor.session.doc.removeFullLines(row, row);
      this.manual.row_image = name;
      this.manual.contextmenu.img = null;
    },
    onMenuReplaceImage: function() {
      var bound = this.overlays.crop_bounds.bound;
      if (!bound) {
        return;
      }
      var img = this.manual.contextmenu.img;
      var target = this.manual.contextmenu.target;
      var w = this.screen.width,
        h = this.screen.height;
      filename = img.name.replace(/(\.\d+x\d+)?\.png/, "");
      filename = filename + '.' + Math.max(w, h) + 'x' + Math.min(w, h) + '.png';
      var self = this;
      $.ajax({
        url: '/images/screenshot',
        method: 'POST',
        dataType: 'json',
        data: {
          screenname: self.device.latest_screen,
          filename: filename,
          bound: bound,
        },
        success: function(res) {
          // console.log(res);
          notify('已替换', 'success');
          $('#screen-crop').css({ 'left': '0px', 'top': '0px', 'width': '0px', 'height': '0px' });
          self.overlays.crop_bounds.bound = null;
          // target.src = img.path + "?t=" + new Date().getTime();
          ws.send(JSON.stringify({ command: "refresh" }));
        },
        error: function(err) {
          console.log('替换失败:\n', err);
          notify('图片替换失败，打开调试窗口查看具体问题', 'error');
        },
      });
      this.manual.contextmenu.img = null;
    }
  },
  watch: {
    'tab': function(newVal, oldVal) {
      if (workspace) { Blockly.svgResize(workspace); }
    },
    'layout.right_portion': function(newVal, oldVal) {
      if (workspace) { Blockly.svgResize(workspace); }
    },
    'screen': function(newVal, oldVal) {
      var ctx = canvas.getContext('2d');
      ctx.drawImage(newVal, 0, 0, canvas.width, canvas.height);
    },
  },
});

/* workspace for Blockly */
var workspace;
/* screen canvas */
var canvas = document.getElementById('canvas');
/* websocket client for debug */
var ws;
/* ace code editor */
var pyviewer;
var pymaneditor;
var Range = ace.require('ace/range').Range;
var makerId;

/* init */
$(function() {

  function initEditors() {
    // in pythonDiv
    pyviewer = ace.edit('python-code-viewer');
    pyviewer.container.style.opacity = "";
    pyviewer.$blockScrolling = Infinity;
    pyviewer.renderer.setScrollMargin(10, 10, 10, 10);
    pyviewer.getSession().setMode('ace/mode/python');
    pyviewer.setOptions({
      readOnly: true,
      maxLines: 40,
      fontSize: 14,
      theme: 'ace/theme/monokai',
      autoScrollEditorIntoView: false,
      showPrintMargin: false,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: false
    });

    // handle Vim write
    ace.config.loadModule('ace/keyboard/vim', function(module) {
      module.Vim.defineEx('write', 'w', function(cm, params) {
        vm.savePyManualCode();
      });
    });

    // in pythonManualDiv
    pymaneditor = ace.edit('python-man-editor');
    pymaneditor.container.style.opacity = "";
    pymaneditor.$blockScrolling = Infinity;
    pymaneditor.renderer.setScrollMargin(10, 10, 10, 10);
    pymaneditor.getSession().setMode('ace/mode/python');
    pymaneditor.setOptions({
      minLines: 20,
      maxLines: 40,
      fontSize: 14,
      newLineMode: 'unix',
      theme: 'ace/theme/monokai',
      keyboardHandler: ''
    });
    // load code just after !pymaneditor == false
    vm.loadPyManualCode();
    // handle Ctrl-S
    pymaneditor.commands.addCommand({
      name: 'savePyManualCode',
      bindKey: { win: 'Ctrl-s', mac: 'Command-s' },
      exec: function(editor) { vm.savePyManualCode(); },
    });
    // handle Ctrl-g
    pymaneditor.commands.addCommand({
      name: 'runPyManualCode',
      bindKey: { win: 'Ctrl-g', mac: 'Command-g' },
      exec: function(editor) { vm.runPyManualCode(); },
    });
    // handle Ctrl-g
    pymaneditor.commands.addCommand({
      name: 'runPyManualCodeToLine',
      bindKey: { win: 'Ctrl-Shift-g', mac: 'Command-Shift-g' },
      exec: function(editor) { vm.runPyManualCodeToLine(); },
    });
    // set data dirty flag
    pymaneditor.on('change', function(e) {
      vm.manual.dirty = true;
      if (e.start.row != e.end.row) {
        vm.updateManualImageCursor();
      }
    });
    // track cursor changes
    pymaneditor.session.on('changeBackMarker', function() {
      var cursor = pymaneditor.getCursorPosition();
      if (vm.manual.cursor != null && vm.manual.cursor.row != cursor.row) {
        vm.checkManualRowImage(pymaneditor.session.getLine(cursor.row));
      }
      vm.manual.cursor = cursor;
    });
    // handle autocompletion
    ace.config.loadModule('ace/ext/language_tools', function(module) {
      var Autocomplete = require('ace/autocomplete').Autocomplete;
      var util = require('ace/autocomplete/util');
      // TODO: complete d.xxx
      var keywords = ['start_app', 'stop_app', 'delay', 'click', 'swipe',
        'keep_screen', 'free_screen', 'screenshot', 'click_image', 'wait',
        'exists'
      ];
      var atxKeywordCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
          var token = session.getTokenAt(pos.row, pos.column);
          if (!token || token.value != '.') {
            callback(true); // callback with err=true
            return;
          }
          var line = editor.session.getLine(pos.row);
          var prefix = util.retrievePrecedingIdentifier(line, pos.column - 1);
          if (prefix !== 'd') {
            callback(true);
            return;
          }
          callback(null, keywords.map(function(word) {
            return { value: word, score: 1, meta: 'atx' };
          }));
        }
      };
      // TODO: complete click_image(, exists(
      var imgnameCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback) {
          var token = session.getTokenAt(pos.row, pos.column);
          if (!token || token.value != '(') {
            callback(true); // callback with err=true
            return;
          }
          var line = editor.session.getLine(pos.row);
          var prefix = util.retrievePrecedingIdentifier(line, pos.column - 1);
          if (!prefix.match(/click_image|exists|match|wait/)) {
            callback(true);
            return;
          }
          callback(null, vm.images.map(function(img) {
            if (img.screen_crop_folder == '.') {
              return { value: '"' + img.name + '"', score: 1, meta: 'image' };
            } else {
              return { value: '"' + img.screen_crop_folder + '/' + img.name + '"', score: 1, meta: 'image' };
            }
          }));
        }
      };
      pymaneditor.completers = [atxKeywordCompleter, imgnameCompleter];

      var pythonCompletePattern = vm.autocomplete.pythonLibMethods;
      if (pythonCompletePattern) {
        var pythonMatchStr = '/';
        for (var pyLib in pythonCompletePattern) {
          pythonMatchStr += pyLib.toString() + '|';
        }
        pythonMatchStr = pythonMatchStr.substr(0,pythonMatchStr.length-1) + '/';
        var pythonCompleter = {
          getCompletions: function (editor, session, pos, prefix, callback) {
            var token = session.getTokenAt(pos.row, pos.column);
            if (!token || token.value != '.') {
              callback(true); // callback with err=true
              return;
            }
            console.log("TEST", "python");
            var line = editor.session.getLine(pos.row);
            var pythonPrefix = util.retrievePrecedingIdentifier(line, pos.column - 1);
            if (!pythonPrefix.match(pythonMatchStr)) {
              callback(true);
              return;
            }
            callback(null, pythonCompletePattern[pythonPrefix].map(function(pyLib) {
              return { value: pyLib, score: 1, meta: 'function' };
            }));
          }
        };
        pymaneditor.completers.push(pythonCompleter);
      }

      // static autocomplete
      pymaneditor.commands.addCommand({
        name: 'atxAutoCompletion',
        bindKey: 'Shift-Tab',
        exec: function(editor) {
          if (!editor.completer) {
            editor.completer = new Autocomplete();
          }

          editor.completer.autoInsert = false;
          editor.completer.autoSelect = true;
          editor.completer.showPopup(editor);
          editor.completer.cancelContextMenu();
        },
      });
      // live autocomplete
      pymaneditor.commands.on('afterExec', function(e) {
        var editor = e.editor;
        if (!editor.completer) {
          editor.completer = new Autocomplete();
        }
        // We don't want to autocomplete with no prefix
        if (e.command.name === "backspace") {
          if (editor.completer.activated && !util.getCompletionPrefix(editor)) {
            editor.completer.detach();
          }
        } else if (e.command.name === "insertstring") {
          if (!editor.completer.activated) {
            editor.completer.autoInsert = false;
            editor.completer.showPopup(editor);
          }
        }
      });
    }); // loadModule done: language_tools
  }

  function connectWebsocket() {
    ws = new WebSocket('ws://' + location.host + '/ws')
    ws.onopen = function() {
      ws.send(JSON.stringify({ command: "refresh" }));
      notify('与后台通信连接成功!!!');
    };
    ws.onmessage = function(evt) {
      try {
        var data = JSON.parse(evt.data)
        console.log('websocket message: ', evt.data);
        switch (data.type) {
          case 'open':
            vm.getDeviceChoices();
            break;
          case 'image_list':
            window.blocklyImageList = [];
            vm.images.splice(0, vm.images.length);
            for (var i = 0, info; i < data.images.length; i++) {
              info = data.images[i];
              window.blocklyImageList.push([info['name'], info['path']]);
              vm.images.push({ name: info['name'], path: window.blocklyBaseURL + info['path'], screen_crop_folder: info['screen_crop_folder'] ,hash: info['hash'] });
            }
            window.blocklyCropImageList = [];
            for (var i = 0, info; i < data.screenshots.length; i++) {
              info = data.screenshots[i]
              window.blocklyCropImageList.push([info['name'], info['path']]);
            }
            vm.device.latest_screen = data.latest;
            notify('图片列表已刷新', 'success');
            break;
          case 'run':
            if (data.status == 'ready') {
              vm.manual.running = false;
            }
            if (data.notify) { notify(data.notify); }
            break;
          case 'stop':
            break;
          case 'traceback':
            alert(data.output);
            break;
          case 'console':
            var $console = $('pre.console');
            var text = $console.html();
            $console.text($console.html() + data.output);
            $console.scrollTop($console.prop('scrollHeight'));
            break;
          case 'lineno':
            var lineno = parseInt(data.lineno);
            if (makerId) {
              pymaneditor.session.removeMarker(makerId);
            }
            makerId = pymaneditor.session.addMarker(
              new Range(lineno-1, 0, lineno-1, 1000), "CodeHighLightMarker", "fullLine");
            break;
          default:
            console.log("No match data type: ", data.type)
        }
      } catch (err) {
        console.log(err, evt.data)
      }
    };
    ws.onerror = function(err) {
      // $.notify(err);
      // console.error(err)
    };
    ws.onclose = function() {
      console.log("Websocket Closed");
      notify('与后台通信连接断开, 2s钟后重新连接 !!!', 'error');
      setTimeout(function() {
        connectWebsocket()
      }, 2000)
    };
  }

  /************************* init here *************************/

  // Initial global value for blockly images
  window.blocklyBaseURL = 'http://' + location.host + '/static_imgs/';
  window.blocklyImageList = null;
  window.blocklyCropImageList = null;
  goog.asserts.ENABLE_ASSERTS = true;
  workspace = Blockly.inject(document.getElementById('blocklyDiv'));

  var screenURL = '/images/screenshot?v=t' + new Date().getTime();

  // listen resize event
  function onResize() {
    vm.layout.width = $('#main-content').width() + 30; // with margin 15+15
    vm.layout.height = document.documentElement.clientHeight;
    var blocklyDivHeight = vm.layout.height - $("#blocklyDiv").offset().top;
    var consoleHeight = $('#left-panel>div:last').height();
    $('#blocklyDiv').height(Math.max(300, blocklyDivHeight - consoleHeight - 20));
    Blockly.svgResize(workspace);
  }
  window.addEventListener('resize', onResize, false);
  onResize();

  // WebSocket for debug
  vm.loadPythonCompletePattern(initEditors);
  connectWebsocket();

  //------------------------ canvas overlays --------------------------//

  function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor((evt.clientX - rect.left) / vm.layout.screen_scale),
      y: Math.floor((evt.clientY - rect.top) / vm.layout.screen_scale),
    };
  }

  // -------- selected is null, used for save screen crop -------
  var crop_bounds = { start: null, end: null, bound: null },
    crop_rect_bounds = { start: null, end: null, bound: null },
    draw_rect = false;

  canvas.addEventListener('mousedown', function(evt) {
    // ignore right click
    if (evt.button == 2) {
      return;
    }
    if (draw_rect) {
      crop_rect_bounds.start = evt;
      crop_rect_bounds.end = null;
    } else {
      crop_bounds.start = evt;
      crop_bounds.end = null;
    }
  });
  canvas.addEventListener('mousemove', function(evt) {
    // ignore fake move
    if (evt.movementX == 0 && evt.movementY == 0) {
      return;
    }
    if (crop_bounds.start == null && crop_rect_bounds.start == null) {
      return;
    }
    var rect = canvas.getBoundingClientRect(),
      $rect, bounds;
    if (draw_rect) {
      crop_rect_bounds.end = evt;
      bounds = crop_rect_bounds;
      $rect = $("#screen-crop-rect");
    } else {
      crop_bounds.end = evt;
      bounds = crop_bounds;
      $rect = $("#screen-crop");
    }
    // update rect position
    var left = bounds.start.pageX - rect.left,
      top = bounds.start.pageY - rect.top,
      width = Math.max(bounds.end.pageX - bounds.start.pageX, 10),
      height = Math.max(bounds.end.pageY - bounds.start.pageY, 10);
    $rect.show();
    $rect.css('left', left + 'px')
      .css('top', top + 'px')
      .css('width', width + 'px')
      .css('height', height + 'px');
  });
  canvas.addEventListener('mouseup', function(evt) {
    if (crop_bounds.end !== null) {
      var start = getMousePos(canvas, crop_bounds.start),
        end = getMousePos(canvas, crop_bounds.end);
      crop_bounds.bound = [start.x, start.y, end.x, end.y];
      vm.overlays.crop_bounds.bound = [start.x, start.y, end.x, end.y];
    }
    crop_bounds.start = null;
    crop_rect_bounds.start = null;
  });
  canvas.addEventListener('mouseout', function(evt) {
    if (crop_bounds.start !== null && crop_bounds.end !== null) {
      var start = getMousePos(canvas, crop_bounds.start),
        end = getMousePos(canvas, crop_bounds.end);
      crop_bounds.bound = [start.x, start.y, end.x, end.y];
      vm.overlays.crop_bounds.bound = [start.x, start.y, end.x, end.y];
    }
    crop_bounds.start = null;
    crop_rect_bounds.start = null;
  });
  // click to clean
  canvas.addEventListener('click', function(evt) {
    if (crop_bounds.start !== null || crop_bounds.end !== null) {
      return;
    }
    crop_bounds.bound = null;
    vm.overlays.crop_bounds.bound = null;
    $('#screen-crop').css({
      'left': '0px',
      'top': '0px',
      'width': '0px',
      'height': '0px'
    }).show();
  });

  /*--------------- resize handle ----------------*/
  function setupResizeHandle() {
    $('#resize-handle').on('drag', function(evt) {
      var x = evt.originalEvent.pageX;
      if (x <= 0) {
        return;
      }
      var p = 1 - (evt.originalEvent.pageX - 30) / (vm.layout.width - 60);
      vm.layout.right_portion = Math.min(55, Math.max(parseInt(p * 100), 25));
      vm.layout.width = $('#main-content').width() + 30; // with margin 15+15
    });
    $('#console-resize-handle').on('drag', function(evt) {
      var pageHeight = document.body.clientHeight;
      var handlePosTop = $('#console-resize-handle').position().top;
      var editorHeight = $('#python-man-editor').height();
      var consoleHeight = $('#pyconsole').height();
      if (vm.console.editorHeight == 0) {
        vm.console.editorHeight = editorHeight;
      }
      if (vm.console.consoleHeight == 0) {
        vm.console.consoleHeight = consoleHeight;
      }
      var y = evt.originalEvent.offsetY;
      var bottom = pageHeight - 150 - editorHeight - consoleHeight;
      if (Math.abs(y) > bottom) {
        return;
      }
      if (handlePosTop > pageHeight - 80) {
        $('#console-resize-handle').position().top = pageHeight - 80;
        if (editorHeight - y <= vm.console.editorHeight) {
          $('#python-man-editor').height(editorHeight - y);
        }
        $('#pyconsole').height(consoleHeight + y);
        return;
      } else {
        $('#pyconsole').height(consoleHeight + y);
      }
    });
  }
  setupResizeHandle();
});
