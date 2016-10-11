/* utils functions */
function notify(message, className, position, autoHideDelay, element){
  className = className || 'info';
  position = position || 'top center';
  autoHideDelay = autoHideDelay || 1500;
  $.notify(message, {className, position, autoHideDelay});
}

Vue.filter('imagename', function(text){
  return text.replace(/(\.\d+x\d+)?\.png/, "");
});

Vue.component('tree-node', {
  template: '#tree-node-template',
  replace: true,
  props: {
    model: Object
  },
  data: function () {
    return {
      open: false
    }
  },
  computed: {
    isFolder: function () {
      return this.model.children &&
        this.model.children.length
    }
  },
  methods: {
    toggle: function () {
      if (this.isFolder) {
        this.open = !this.open
      }
    },
    changeType: function () {
      if (!this.isFolder) {
        Vue.set(this.model, 'children', [])
        this.addChild()
        this.open = true
      }
    },
    addChild: function () {
      this.model.children.push({
        name: 'new stuff'
      })
    },
    openContextMenu: function(evt){
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
    tab: 'blocklyDiv',
    // choose device
    choosing: false,
    android_serial_choices: [],
    android_serial: '',
    ios_url: '',
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
    // blockly stuff
    blockly: {
      selected: null, // Blockly.selected, only the statement ones.
      dirty: false, // has there any changes been made
      running: false,
      saving: false,
      xml: '',
      pythonText: '',
      pythonDebugText: '',
    },
    images: [],
    // screen overlays
    overlays: {
      selected: null,
      crop_bounds: {bound:null}, // null
      click_point: {}, // atx_click
      rect_bounds: {}, // atx_click_image
      swipe_points: {}, // atx_swipe
    },
    // python extension
    ext: {
      dirty: false,
      pythonText: '',
      vimmode: true,
    },
    manual: {
      dirty: false,
      pythonText: '',
      vimmode: true,
      selected: null,
      running: false,
      cursor: null,
      row_image: null,
      usedimages: null,
      contextmenu: {
        left: 0,
        top: 0,
        img: null,
      },
    }
  },
  computed: {
    canvas_width: function() {
      var margin = 30; // right 15 + left 15
      return (this.layout.width-2*margin) * this.layout.right_portion/100.0 - margin;
    },
    canvas_height: function() {
      canvas.width = this.canvas_width;
      canvas.height = this.canvas_width * this.layout.screen_ratio;
      if (this.screen) {
        var ctx = canvas.getContext('2d');
        ctx.drawImage(this.screen, 0, 0, canvas.width, canvas.height);
        this.layout.screen_scale = this.canvas_width/this.screen.width;
      }
      return canvas.height;
    },
  },
  methods: {
    switchTab: function(which) {
      if (which == this.tab) { return; }
      if (this.tab == 'blocklyDiv' && this.blockly.dirty) {this.saveWorkspace();}
      if (this.tab == 'pythonExtDiv' && this.ext.dirty) {this.savePyExtension();}
      if (which == 'pythonExtDiv' && pyexteditor) {pyexteditor.focus();}
      if (which == 'pythonManualDiv' && pymaneditor) {pymaneditor.focus();}
      this.tab = which;
    },
    generateCode: function(){
      var pyprefix = '#-*- encoding: utf-8 -*-\n\n';
      this.blockly.xml = Blockly.Xml.workspaceToDom(workspace);
      this.blockly.xmlText = Blockly.Xml.domToPrettyText(this.blockly.xml),
      Blockly.Python.STATEMENT_PREFIX = '';
      this.blockly.pythonText = pyprefix + Blockly.Python.workspaceToCode(workspace);
      Blockly.Python.STATEMENT_PREFIX = 'highlight_block(%1);\n';
      this.blockly.pythonDebugText = pyprefix + Blockly.Python.workspaceToCode(workspace);
      Blockly.Python.STATEMENT_PREFIX = '';
      // highlight python code block
      this.$nextTick(function(){
        pyviewer.setValue(this.blockly.pythonText);
        pyviewer.selection.clearSelection();
      });
    },
    saveWorkspace: function(){
      if (!workspace) {return;}
      this.generateCode();
      var self = this;
      // save
      $.ajax({
        url: '/workspace',
        method: 'POST',
        data: {'xml_text': this.blockly.xmlText, 'python_text': this.blockly.pythonText},
        success: function(data){
          notify('Workspace保存成功', 'success');
          self.blockly.dirty = false;
        },
        error: function(e){
          console.log('Workspace保存失败:\n', e);
          notify(e.responseText || '保存失败，请检查服务器连接是否正常', 'warn');
        },
      });
    },
    runBlockly: function(){
      this.blockly.running = true;
      workspace.traceOn(true); // enable step run
      ws.send(JSON.stringify({command: "run", code:this.blockly.pythonDebugText}));
    },
    runBlocklyStep: function(){
      if (!this.blockly.selected) {return;}
      var pyprefix = '#-*- encoding: utf-8 -*-\n\n';
      Blockly.Python.STATEMENT_PREFIX = 'highlight_block(%1);\n';
      Blockly.Python.init(workspace);
      var blk = workspace.getBlockById(this.blockly.selected),
          func = Blockly.Python[blk.type],
          code = func.call(blk, blk),
          code = pyprefix + code;
      Blockly.Python.finish(code);
      Blockly.Python.STATEMENT_PREFIX = '';
      this.blockly.running = true;
      console.log("running:\n", code);
      workspace.traceOn(true); // enable step run
      ws.send(JSON.stringify({command: "run", code:code}));
    },
    stopBlockly: function(){
      console.log('stop');
      ws.send(JSON.stringify({command: "stop", code:this.blockly.pythonDebugText}));
    },
    getDeviceChoices: function(){
      var self = this;
      self.device.refreshing = true;
      $.ajax({
        url: '/device',
        method: 'GET',
        dataType: 'json',
        data: {
          platform: this.device.platform,
        },
        success: function(data){
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
    connectDevice: function(){
      var serial = this.device.platform == 'ios' ? this.ios_url : this.android_serial;
      console.log("connecting", this.device.platform, serial);
      var self = this;
      $.ajax({
        url: '/device',
        method: 'POST',
        dataType: 'json',
        data: {
          serial: serial,
        },
        success: function(data){
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
    cancelConnectDevice: function(){
      this.choosing = false;
    },
    openChooseDevice: function(){
      this.getDeviceChoices();
    },
    refreshScreen: function() {
      var url = '/images/screenshot?v=t' + new Date().getTime();
      this.loadScreen(url,
        function(){
          notify('Refresh Done.', 'success');
          ws.send(JSON.stringify({command: "refresh"}));},
        function(){ notify('Refresh Failed.', 'error');}
      );
    },
    checkAutoRefreshScreen: function(evt){
      notify('Not Implemented yet.', 'error');
      return;
      var self = this;
      if (evt.target.checked) {
        self.autorefresh = setInterval(function () {
          var url = '/images/screenshot?v=t' + new Date().getTime();
          console.log('get screen', url);
          //self.loadScreen(url);
        }, 300);
      } else {
        if (self.autorefresh != null) {
          clearInterval(self.autorefresh);
        }
        self.autorefresh = null;
      }
    },
    loadScreen: function(url, callback, errback){
      if (!url || (this.screen && url == this.screen.src)) {return;}
      var img = new Image(),
          self = this;
      self.refreshing = true;
      img.crossOrigin = 'anonymous';
      img.addEventListener('load', function(){
        self.layout.screen_ratio = img.height / img.width;
        self.refreshing = false;
        self.screen = img;
        if (callback) { callback(); }
      });
      img.addEventListener('error', function(err){
        console.log('loadScreen Error:', err);
        self.refreshing = false;
        if (errback) {errback(err);}
      });
      img.src = url;
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
      if (!filename){
        return;
      }
      if (filename.substr(-4, 4) == '.png') {
        filename = filename.substr(0, filename.length-4);
      }
      var w = this.screen.width, h = this.screen.height;
      filename = filename+'.'+Math.max(w, h)+'x'+Math.min(w, h)+'.png';
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
        success: function(res){
          // console.log(res);
          notify('图片保存成功', 'success');
          ws.send(JSON.stringify({command: "refresh"}));
          $('#screen-crop').css({'left':'0px', 'top':'0px','width':'0px', 'height':'0px'});
          self.overlays.crop_bounds.bound = null;
        },
        error: function(err){
          console.log('图片保存失败:\n', err);
          notify('图片保存失败，打开调试窗口查看具体问题', 'error');
        },
      });
    },
    saveScreenCropRightClick: function(evt){
      if (this.device.latest_screen == '' || this.overlays.crop_bounds.bound === null) {
        return;
      }
      evt.preventDefault()
      this.saveScreenCrop();
    },
    savePyExtension: function(){
      if (!pyexteditor) {return;}
      this.ext.pythonText = pyexteditor.getValue();
      this.updateExtBlocks();
      var self = this;
      $.ajax({
        url: '/extension',
        method: 'POST',
        data: {'python_text': this.ext.pythonText},
        success: function(data){
          notify('Extension保存成功', 'success');
          self.ext.dirty = false;
        },
        error: function(e){
          console.log('Extension保存失败:', e);
          notify(e.responseText || '保存失败，请检查服务器连接是否正常', 'warn');
        },
      });
    },
    addExtBlock: function(name, args){
      if (!workspace) {return;}
      var helpUrl = 'https://github.com/codeskyblue/AirtestX';
      // register block
      var block_type = 'atx_ext_' + name;
      var inject_device = false;
      if (args.length > 0 && args[0][0] == 'd') {
        args = args.splice(1, args.length);
        inject_device = true;
      }
      Blockly.Blocks[block_type] = {
        init: function() {
          this.appendDummyInput()
              .appendField(name);
          for (var i = 0, arg; i < args.length; i++) {
            arg = args[i];
            this.appendDummyInput().appendField(arg[0]);
            this.appendValueInput(arg[0]);
          }
          this.setInputsInline(true);
          this.setPreviousStatement(true);
          this.setNextStatement(true);
          this.setColour('#74a55b');
          this.setTooltip('');
          this.setHelpUrl(helpUrl);
        }
      }
      // register code generate
      Blockly.Python[block_type] = function(blk) {
        // import ext in front, must be defined in block code generate function...
        Blockly.Python.provideFunction_('atx_import_ext', ['import ext']);
        var argv = [], v;
        if (inject_device) {argv.push('d');}
        for (var i = 0, arg; i < args.length; i++) {
          arg = args[i];
          v = Blockly.Python.valueToCode(blk, arg[0], Blockly.Python.ORDER_ATOMIC);
          if (v == '') { v = 'None';}
          argv.push(arg[0] + '=' + v);
        }
        var code = 'ext.' + name + '(' + argv.join(', ') + ')\n';
        return code;
      }

      // update xml data && re populate toolbox
      var toolbox = document.getElementById('toolbox'),
          nodes = toolbox.lastElementChild.children;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('type') == block_type) {
          return;
        }
      }
      var node = document.createElement('block');
      node.setAttribute('type', block_type);
      toolbox.lastElementChild.appendChild(node);
      var tree = Blockly.Options.parseToolboxTree(toolbox);
      // NOTE: the ones used in workspace can not be deleted
      workspace.toolbox_.populate_(tree);
    },
    updateExtBlocks: function(){
      var m, words, word, name, args,
          funcs = [],
          lines = this.ext.pythonText.split('\n');
      for (var i = 0, line; i < lines.length; i++) {
        line = lines[i];
        m = line.match(/^\s*def\s+(\w+)\s*\((.*)\)\s*:/);
        if (!m) { continue; }
        name = m[1];
        words = m[2].split(',')
        args = [];
        for (var j = 0; j < words.length; j++) {
          word = words[j];
          m = word.match(/^\s*(\w+)(\s*\=\s*(\w+))?/);
          if (!m) {continue;}
          args.push([m[1], m[3]||'']); // arg name & default value
        }
        funcs.push({name, args});
      }
      var toolbox = document.getElementById('toolbox'),
          nodes = toolbox.lastElementChild.children;
      // remove old
      for (var i = 0, node; i < nodes.length; i++) {
        node = nodes[i];
        toolbox.lastElementChild.removeChild(node);
      }
      // add new
      for (var i = 0, f; i < funcs.length; i++) {
        f = funcs[i];
        this.addExtBlock(f.name, f.args);
      }
    },
    clearConsole: function(){
      $('pre.console').html('');
    },
    toggleExtVimMode: function(){
      this.ext.vimmode = !this.ext.vimmode;
      if (this.ext.vimmode) {
        pyexteditor.setKeyboardHandler('ace/keyboard/vim');
      } else {
        pyexteditor.setKeyboardHandler();
      }
    },
    runPyManualCode: function(){
      if (this.manual.dirty) { this.savePyManualCode(); }
      this.manual.running = true;
      ws.send(JSON.stringify({command: "run", code:this.manual.pythonText}));
    },
    runPyManualCodeToLine: function(line){
      var cursor = pymaneditor.getCursorPosition(),
          lines = pymaneditor.session.doc.getLines(0, cursor.row),
          char = pymaneditor.session.doc.getNewLineCharacter(),
          code = lines.join(char);
      this.manual.running = true;
      ws.send(JSON.stringify({command: "run", code:code}));
    },
    runPyManualCodeSelected: function(){
      notify('Not Implemented yet.', 'error');
    },
    stopPyManualCode: function(){
      notify('Not Implemented yet.', 'error');
    },
    savePyManualCode: function(){
      if (!pymaneditor) {return;}
      this.manual.pythonText = pymaneditor.getValue();
      var self = this;
      $.ajax({
        url: '/manual_code',
        method: 'POST',
        data: {'python_text': self.manual.pythonText},
        success: function(data){
          notify('Code保存成功', 'success');
          self.manual.dirty = false;
        },
        error: function(e){
          console.log('Code保存失败:', e);
          notify(e.responseTman || 'Code保存失败，请检查服务器连接是否正常', 'warn');
        },
      });
    },
    toggleManualVimMode: function(){
      this.manual.vimmode = !this.manual.vimmode;
      if (this.manual.vimmode) {
        pymaneditor.setKeyboardHandler('ace/keyboard/vim');
      } else {
        pymaneditor.setKeyboardHandler();
      }
    },
    checkManualRowImage: function(text){
        var regexp = /[^"]+\.png(?="|')/,
            m = regexp.exec(text);
        if (!m) {
          this.manual.row_image = null;
          return;
        }
        this.manual.row_image = m[0];
    },
    updateManualImageCursor: function(){
      var regexp = /[^"]+\.png(?="|')/;
      var lines = pymaneditor.session.doc.getAllLines();
      var usedimages = {};
      for (var i = 0, line; i < lines.length; i++) {
        line = lines[i];
        m = regexp.exec(line);
        if (m) {
          if (!usedimages[m[0]]) { usedimages[m[0]] = [];}
          usedimages[m[0]].push({row:i, column:m.index});
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
    hideContextMenu: function(){
      this.manual.contextmenu.img = null;
    },
    onMenuDelete: function() {
      if (!this.manual.contextmenu.img) {return;}
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
      for (var i = 0, info, blkidx=-1; i < window.blocklyImageList.length; i++) {
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
        data: {'imgpath': imgpath},
        success: function(data){
          self.images.splice(idx, 1);
          if (blkidx != -1) {
            window.blocklyImageList.splice(blkidx, 1);
          }
          notify('删除成功', 'success');
        },
        error: function(e){
          console.log('删除失败:\n', e);
          notify(e.responseText || '删除失败，请检查服务器连接是否正常', 'warn');
        },
      });
      this.manual.contextmenu.img = null;
    },
    onMenuInsertClickImage: function(){
      if (!this.manual.contextmenu.img) {return;}
      var cursor = pymaneditor.getCursorPosition();
      var line = pymaneditor.session.getLine(cursor.row);
      var script = 'd.click_image(u"'+ this.manual.contextmenu.img.name +'")\n';
      if (line !== '') {
        cursor = {row: cursor.row+1, column:0};
      }
      pymaneditor.session.insert(cursor, script);
      pymaneditor.navigateTo(cursor.row, 0);
      this.manual.contextmenu.img = null;
    },
    onMenuReplaceRowImage: function(){
      if (!this.manual.contextmenu.img || !this.manual.row_image) {return;}
      var row = this.manual.cursor.row;
      var text = pymaneditor.session.getLine(row);
      var regexp = /[^"]+\.png(?="|')/;
      var name = this.manual.contextmenu.img.name;
      text = text.replace(regexp, name);
      pymaneditor.session.doc.insertFullLines(row+1, [text]);
      pymaneditor.session.doc.removeFullLines(row, row);
      this.manual.row_image = name;
      this.manual.contextmenu.img = null;
    },
    onMenuReplaceImage: function(){
      var bound = this.overlays.crop_bounds.bound;
      var img = this.manual.contextmenu.img;
      var target = this.manual.contextmenu.target;
      var w = this.screen.width, h = this.screen.height;
      filename = img.name.replace(/(\.\d+x\d+)?\.png/, "");
      filename = filename+'.'+Math.max(w, h)+'x'+Math.min(w, h)+'.png';
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
        success: function(res){
          // console.log(res);
          notify('已替换', 'success');
          $('#screen-crop').css({'left':'0px', 'top':'0px','width':'0px', 'height':'0px'});
          self.overlays.crop_bounds.bound = null;
          target.src = img.path + "?t=" + new Date().getTime();
        },
        error: function(err){
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
var pyexteditor;
var pymaneditor;

/* init */
$(function(){

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
    });
    // in pythonExtDiv
    pyexteditor = ace.edit('python-ext-editor');
    pyexteditor.container.style.opacity = "";
    pyexteditor.$blockScrolling = Infinity;
    pyexteditor.renderer.setScrollMargin(10, 10, 10, 10);
    pyexteditor.getSession().setMode('ace/mode/python');
    pyexteditor.setOptions({
      maxLines: 40,
      fontSize: 14,
      newLineMode: 'unix',
      theme: 'ace/theme/monokai',
      keyboardHandler: 'ace/keyboard/vim',
    });
    // handle Vim write
    ace.config.loadModule('ace/keyboard/vim', function(module){
      module.Vim.defineEx('write', 'w', function(cm, params) {
        if (cm.ace == pyexteditor) {
          vm.savePyExtension();
        } else if (cm.ace == pymaneditor) {
          vm.savePyManualCode();
        }
      });
    });
    // handle Ctrl-S
    pyexteditor.commands.addCommand({
      name: 'savePyExtension',
      bindKey: {win:'Ctrl-s', mac:'Command-s'},
      exec: function(editor) { vm.savePyExtension(); },
    });
    // set data dirty flag
    pyexteditor.on('change', function(){
      vm.ext.dirty = true;
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
      keyboardHandler: 'ace/keyboard/vim',
    });
    // handle Ctrl-S
    pymaneditor.commands.addCommand({
      name: 'savePyManualCode',
      bindKey: {win:'Ctrl-s', mac:'Command-s'},
      exec: function(editor) { vm.savePyManualCode(); },
    });
    // handle Ctrl-g
    pymaneditor.commands.addCommand({
      name: 'runPyManualCode',
      bindKey: {win:'Ctrl-g', mac:'Command-g'},
      exec: function(editor) { vm.runPyManualCode(); },
    });
    // handle Ctrl-g
    pymaneditor.commands.addCommand({
      name: 'runPyManualCodeToLine',
      bindKey: {win:'Ctrl-Shift-g', mac:'Command-Shift-g'},
      exec: function(editor) { vm.runPyManualCodeToLine(); },
    });
    // set data dirty flag
    pymaneditor.on('change', function(e){
      vm.manual.dirty = true;
      if (e.start.row != e.end.row) {
        vm.updateManualImageCursor();
      }
    });
    // track cursor changes
    pymaneditor.session.on('changeBackMarker', function(){
      var cursor = pymaneditor.getCursorPosition();
      if (vm.manual.cursor != null && vm.manual.cursor.row != cursor.row){
        vm.checkManualRowImage(pymaneditor.session.getLine(cursor.row));
      }
      vm.manual.cursor = cursor;
    });
    // handle autocompletion
    ace.config.loadModule('ace/ext/language_tools', function(module){
      var Autocomplete = require('ace/autocomplete').Autocomplete;
      var util = require('ace/autocomplete/util');
      // TODO: complete d.xxx
      var keywords = ['start_app', 'stop_app', 'delay', 'click', 'swipe',
          'keep_screen', 'free_screen', 'screenshot', 'click_image', 'wait',
          'exists'];
      var atxKeywordCompleter = {
        getCompletions: function(editor, session, pos, prefix, callback){
          var token = session.getTokenAt(pos.row, pos.column);
          if (!token || token.value != '.') {
            callback(true); // callback with err=true
            return;
          }
          var line = editor.session.getLine(pos.row);
          var prefix = util.retrievePrecedingIdentifier(line, pos.column-1);
          if (prefix !== 'd') {
            callback(true);
            return;
          }
          callback(null, keywords.map(function(word){
              return {value: word, score: 1, meta: 'atx'};
            })
          );
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
          var prefix = util.retrievePrecedingIdentifier(line, pos.column-1);
          if (!prefix.match(/click_image|exists|match|wait/)) {
            callback(true);
            return;
          }
          callback(null, vm.images.map(function(img){
              return { value: '"'+img.name+'"', score: 1, meta: 'image'};
            })
          );
        }
      };
      pymaneditor.completers = [atxKeywordCompleter, imgnameCompleter];
      // // static autocomplete
      // pymaneditor.commands.addCommand({
      //   name: 'atxAutoCompletion',
      //   bindKey: 'Shift-Tab',
      //   exec: function(editor) {
      //     if (!editor.completer) {
      //       editor.completer = new Autocomplete();
      //     }
      //     editor.completer.autoInsert = false;
      //     editor.completer.autoSelect = true;
      //     editor.completer.showPopup(editor);
      //     editor.completer.cancelContextMenu();
      //   },
      // });
      // live autocomplete
      pymaneditor.commands.on('afterExec', function(e){
        var editor = e.editor;
        if (!editor.completer) {
          editor.completer = new Autocomplete();
        }
        // We don't want to autocomplete with no prefix
        if (e.command.name === "backspace") {
          if (editor.completer.activated && !util.getCompletionPrefix(editor)) {
              editor.completer.detach();
          }
        }
        else if (e.command.name === "insertstring") {
          if (!editor.completer.activated) {
            editor.completer.autoInsert = false;
            editor.completer.showPopup(editor);
          }
        }
      });
    }); // loadModule done: language_tools
  }

  function restoreExtension() {
    $.get('/extension')
      .success(function(res){
        vm.ext.pythonText = res.ext_text;
        pyexteditor.setValue(res.ext_text);
        pyexteditor.clearSelection();
        vm.updateExtBlocks();
        restoreWorkspace();
      })
      .error(function(res){
        alert(res.responseText);
      })
  }

  function restoreWorkspace() {
    $.get('/workspace')
      .success(function(res){
        // change to blockly tab
        vm.tab = 'blocklyDiv';
        var xml = Blockly.Xml.textToDom(res.xml_text);
        // check ext functions, auto add missing ones.
        var err_exts = [],
            blks = $(xml).find('block');
        for (var i = 0, type; i < blks.length; i++) {
          type = blks[i].getAttribute('type');
          if (!Blockly.Python[type]) {
            if (type.substr(0,8) == 'atx_ext_') {
              type = type.substr(8);
            }
            err_exts.push(type);
          }
        }
        if (err_exts.length > 0) {
          notify('Found undefined blocks! Auto generating. Check log for more details.',
              'warn', null, 3000);
          console.log('missing block definition:', err_exts);
          var txt = '\n\n';
          for (var i = 0, func; i < err_exts.length; i++) {
            txt += 'def ' + err_exts[i] + '(*args, **kwargs):\n    pass\n';
          }
          pyexteditor.insert(txt);
          vm.ext.pythonText += txt;
          vm.ext.dirty = true;
          vm.updateExtBlocks();
        }
        /* check done. */

        vm.$nextTick(function(){
          workspace.clear(); // clear up before add
          try {
            Blockly.Xml.domToWorkspace(workspace, xml);
          } catch(e) {
            alert(e.message);
            console.log('load workspace error:', e, xml);
            return;
          }
          vm.generateCode();
        })
      })
      .error(function(res){
        alert(res.responseText);
      })
  }

  function restoreManualCode() {
    $.get('/manual_code')
      .success(function(res){
        vm.manual.pythonText = res.man_text;
        pymaneditor.setValue(res.man_text);
        pymaneditor.clearSelection();
      })
      .error(function(res){
        alert(res.responseText);
      })
  }

  function connectWebsocket(){
    ws = new WebSocket('ws://'+location.host+'/ws')

    ws.onopen = function(){
      ws.send(JSON.stringify({command: "refresh"}))
      notify('与后台通信连接成功!!!');
      restoreExtension();
      restoreManualCode();
    };
    ws.onmessage = function(evt){
      try {
        var data = JSON.parse(evt.data)
        console.log('websocket message: ', evt.data);
        switch(data.type){
        case 'open':
          vm.getDeviceChoices();
          break;
        case 'image_list':
          window.blocklyImageList = [];
          vm.images.splice(0, vm.images.length);
          for (var i = 0, info; i < data.images.length; i++) {
            info = data.images[i];
            window.blocklyImageList.push([info['name'], info['path']]);
            vm.images.push({name:info['name'], path:window.blocklyBaseURL+info['path']});
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
            vm.blockly.running = false;
            vm.manual.running = false;
          }
          if (data.notify) {notify(data.notify);}
          break;
        case 'stop':
          break;
        case 'traceback':
          alert(data.output);
          break;
        case 'highlight':
          var id = data.id;
          workspace.highlightBlock(id)
          break;
        case 'console':
          var $console = $('pre.console');
          var text = $console.html();
          $console.text($console.html() + data.output);
          $console.scrollTop($console.prop('scrollHeight'));
          break;
        default:
          console.log("No match data type: ", data.type)
        }
      }
      catch(err){
        console.log(err, evt.data)
      }
    };
    ws.onerror = function(err){
      // $.notify(err);
      // console.error(err)
    };
    ws.onclose = function(){
      console.log("Websocket Closed");
      notify('与后台通信连接断开, 2s钟后重新连接 !!!', 'error');
      setTimeout(function(){
        connectWebsocket()
      }, 2000)
    };
  }

  /************************* init here *************************/

  // Initial global value for blockly images
  window.blocklyBaseURL = 'http://'+ location.host +'/static_imgs/';
  window.blocklyImageList = null;
  window.blocklyCropImageList = null;
  Blockly.Python.addReservedWords('highlight_block');
  goog.asserts.ENABLE_ASSERTS = true;
  workspace = Blockly.inject(document.getElementById('blocklyDiv'), {
    toolbox: document.getElementById('toolbox'),
    media: '/static/blockly/media/',
  });

  var screenURL = '/images/screenshot?v=t' + new Date().getTime();

  // blocklyDiv handle Ctrl-s
  document.addEventListener('keydown', function(e){
    if (vm.tab != 'blocklyDiv' && vm.tab != 'pythonDiv') {
      return;
    }
    if (e.ctrlKey && e.key == 's') {
      vm.saveWorkspace();
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // listen resize event
  function onResize(){
    vm.layout.width = $('#main-content').width()+30; // with margin 15+15
    vm.layout.height = document.documentElement.clientHeight;
    var blocklyDivHeight = vm.layout.height - $("#blocklyDiv").offset().top;
    var consoleHeight = $('#left-panel>div:last').height();
    $('#blocklyDiv').height(Math.max(300, blocklyDivHeight-consoleHeight-20));
    Blockly.svgResize(workspace);
  }
  window.addEventListener('resize', onResize, false);
  onResize();

  // WebSocket for debug
  initEditors();
  connectWebsocket()

  //------------------------ canvas overlays --------------------------//

  function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor((evt.clientX - rect.left) / vm.layout.screen_scale),
      y: Math.floor((evt.clientY - rect.top) / vm.layout.screen_scale),
    };
  }

  function getCanvasPos(x, y) {
      var left = vm.layout.screen_scale * x,
          top  = vm.layout.screen_scale * y;
      return {left, top};
  }

  var overlays = {
    "atx_click" : {
      $el: $('<div>').addClass('point').hide().appendTo('#screen-overlays'),
      update: function(data){
        var pos = getCanvasPos(data.x, data.y);
        this.$el.css('left', pos.left+'px')
                .css('top', pos.top+'px');
      },
    },
    "atx_click_image" : {
      $el: $('<div>').addClass('image-rect').hide().appendTo('#screen-overlays')
          .append($('<div>').addClass('point')),
      update: function(data){
        var p1 = getCanvasPos(data.x1, data.y1),
            p2 = getCanvasPos(data.x2, data.y2),
            width = p2.left - p1.left,
            height = p2.top - p1.top;
        this.$el.css('left', p1.left+'px')
                .css('top', p1.top+'px')
                .css('width', width+'px')
                .css('height', height+'px');
        this.$el.children().css('left', (data.c.x+50)+'%').css('top', (data.c.y+50)+'%');
      },
    },
    "atx_click_ui" : {
      $el: $('<div>').addClass('ui-rect').hide().appendTo('#screen-overlays'),
      update: function(data){
        var p1 = getCanvasPos(data.x1, data.y1),
            p2 = getCanvasPos(data.x2, data.y2),
            width = p2.left - p1.left,
            height = p2.top - p1.top;
        this.$el.css('left', p1.left+'px')
                .css('top', p1.top+'px')
                .css('width', width+'px')
                .css('height', height+'px');
      },
    },
    "atx_swipe" : {
      $el: $('#overlays-swipe').addClass('full').hide(),
      update: function(data){
        var p1 = getCanvasPos(data.x1, data.y1),
            p2 = getCanvasPos(data.x2, data.y2);
        var $svg = this.$el.children('svg'),
            cstart = '<circle cx="'+p1.left+'" cy="'+p1.top+'" fill="black" r="3"></circle>'
            cend = '<circle cx="'+p2.left+'" cy="'+p2.top+'" fill="white" r="3"></circle>'
            line = '<line stroke="black" stroke-width="2"' +
                   ' x1="'+p1.left+'" y1="'+p1.top +
                   '" x2="'+p2.left+'" y2="'+p2.top+'"></line>';
        $svg.html(cstart + line + cend);
      },
    },
  };

  //------------ canvas do different things for different block ------------//

  // -------- selected is null, used for save screen crop -------
  var crop_bounds = {start: null, end: null, bound:null},
      crop_rect_bounds = {start:null, end:null, bound:null},
      draw_rect = false;

  // Alt: 18, Ctrl: 17, Shift: 16
  // $('body').on('keydown', function(evt){
  //   if (true || evt.keyCode != 18) {return;}
  //   draw_rect = true;
  //   crop_bounds.start = crop_bounds.end = crop_bounds.bound = null;
  //   // $("#screen-crop").css({'left':'0px', 'top':'0px', 'width':'0px', 'height':'0px'});
  // });
  // $('body').on('keyup', function(evt){
  //   if (evt.keyCode != 18) {return;}
  //   draw_rect = false;
  //   crop_rect_bounds.start = crop_rect_bounds.end = crop_rect_bounds.bound = null;
  //   // $("#screen-crop-rect").css({'left':'0px', 'top':'0px', 'width':'0px', 'height':'0px'});
  // });

  canvas.addEventListener('mousedown', function(evt){
    // ignore right click
    if (evt.button == 2) {return;}
    var blk = Blockly.selected;
    if (blk !== null) {
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
  canvas.addEventListener('mousemove', function(evt){
    // ignore fake move
    if (evt.movementX == 0 && evt.movementY == 0) {
      return;
    }
    var blk = Blockly.selected;
    if (blk !== null || (crop_bounds.start == null && crop_rect_bounds.start == null)) {
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
    $rect.css('left', left+'px')
         .css('top', top+'px')
         .css('width', width+'px')
         .css('height', height+'px');
  });
  canvas.addEventListener('mouseup', function(evt){
    var blk = Blockly.selected;
    if (blk !== null) {
      return;
    }
    if  (crop_bounds.end !== null) {
      var start = getMousePos(canvas, crop_bounds.start),
          end = getMousePos(canvas, crop_bounds.end);
      crop_bounds.bound = [start.x, start.y, end.x, end.y];
      vm.overlays.crop_bounds.bound = [start.x, start.y, end.x, end.y];
    }
    crop_bounds.start = null;
    crop_rect_bounds.start = null;
  });
  canvas.addEventListener('mouseout', function(evt){
    var blk = Blockly.selected;
    if (blk !== null) {
      return;
    }
    if  (crop_bounds.start !==null && crop_bounds.end !== null) {
      var start = getMousePos(canvas, crop_bounds.start),
          end = getMousePos(canvas, crop_bounds.end);
      crop_bounds.bound = [start.x, start.y, end.x, end.y];
      vm.overlays.crop_bounds.bound = [start.x, start.y, end.x, end.y];
    }
    crop_bounds.start = null;
    crop_rect_bounds.start = null;
  });
  // click to clean
  canvas.addEventListener('click', function(evt){
    var blk = Blockly.selected;
    if (blk !== null || crop_bounds.start !== null || crop_bounds.end !== null) {
      return;
    }
    crop_bounds.bound = null;
    vm.overlays.crop_bounds.bound = null;
    $('#screen-crop').css({'left':'0px', 'top':'0px',
        'width':'0px', 'height':'0px'}).show();
  });

  // -------- selected is atx_click ----------
  canvas.addEventListener('click', function(evt){
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_click') {
      return;
    }
    // update model in blockly
    var pos = getMousePos(this, evt);
    var rect = canvas.getBoundingClientRect();
    blk.setFieldValue(pos.x, 'X');
    blk.setFieldValue(pos.y, 'Y');
    // update point position
    var $point = overlays['atx_click'].$el;
    $point.css('left', (evt.pageX-rect.left)+'px').css('top', (evt.pageY-rect.top)+'px');
  });

  // --------- selected is atx_click_image ------------
  var rect_bounds = {start: null, end: null};
  canvas.addEventListener('mousedown', function(evt){
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_click_image') {
      return;
    }
    rect_bounds.start = evt;
    rect_bounds.end = null;
  });
  canvas.addEventListener('mousemove', function(evt){
    // ignore fake move
    if (evt.movementX == 0 && evt.movementY == 0) {
      return;
    }
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_click_image' || rect_bounds.start == null) {
      return;
    }
    rect_bounds.end = evt;
    // update model in blockly
    var pat_conn = blk.getInput('ATX_PATTERN').connection.targetConnection;
    if (pat_conn == null) { return;}
    var pat_blk = pat_conn.sourceBlock_;
    if (pat_blk.type != 'atx_image_pattern_offset') {return;}
    var img_conn = pat_blk.getInput('FILENAME').connection.targetConnection;
    if (img_conn == null) { return;}
    var img_blk = img_conn.sourceBlock_;
    if (img_blk.type != 'atx_image_crop_preview') {return; }
    var crop_conn = img_blk.getInput('IMAGE_CROP').connection.targetConnection;
    if (crop_conn == null) { return;}
    var crop_blk = crop_conn.sourceBlock_,
        start_pos = getMousePos(this, rect_bounds.start),
        end_pos = getMousePos(this, rect_bounds.end);
    crop_blk.setFieldValue(start_pos.x, 'LEFT');
    crop_blk.setFieldValue(start_pos.y, 'TOP');
    crop_blk.setFieldValue(end_pos.x - start_pos.x, 'WIDTH');
    crop_blk.setFieldValue(end_pos.y - start_pos.y, 'HEIGHT');
    pat_blk.setFieldValue(0, 'OX');
    pat_blk.setFieldValue(0, 'OY');

    // update image-rect position
    var $rect = overlays['atx_click_image'].$el,
        rect = canvas.getBoundingClientRect(),
        left = rect_bounds.start.pageX,
        top = rect_bounds.start.pageY,
        width = Math.max(rect_bounds.end.pageX - left, 10),
        height = Math.max(rect_bounds.end.pageY - top, 10);
    $rect.css('left', (left-rect.left)+'px')
         .css('top', (top-rect.top)+'px')
         .css('width', width+'px')
         .css('height', height+'px');
    $rect.children().css('left', '50%').css('top', '50%');
  });
  canvas.addEventListener('mouseup', function(evt){
    var blk = Blockly.selected;
    // mouseup event should only be triggered when there happened mousemove
    if (blk == null || blk.type != 'atx_click_image' || rect_bounds.end == null) {
      return;
    }
    rect_bounds.start = null;
  });
  canvas.addEventListener('mouseout', function(evt){
    var blk = Blockly.selected;
    // mouseout is same as mouseup
    if (blk == null || blk.type != 'atx_click_image' || rect_bounds.end == null) {
      return;
    }
    rect_bounds.start = null;
  });
  canvas.addEventListener('click', function(evt){
    var blk = Blockly.selected;
    // click event should only be triggered when there's no mousemove happened.
    if (blk == null || blk.type != 'atx_click_image' || rect_bounds.end != null) {
      return;
    }
    rect_bounds.start = null;
    // update model in blockly
    var pat_conn = blk.getInput('ATX_PATTERN').connection.targetConnection;
    if (pat_conn == null) { return;}
    var pat_blk = pat_conn.sourceBlock_;
    if (pat_blk.type !== 'atx_image_pattern_offset') {return;}

    // update image-rect point position
    var $rect = overlays['atx_click_image'].$el,
        pos = $rect.position(),
        x = pos.left,
        y = pos.top,
        w = $rect.width(),
        h = $rect.height(),
        cx = x + w/2,
        cy = y + h/2,
        ox = parseInt((evt.pageX - cx)/w * 100),
        oy = parseInt((evt.pageY - cy)/h * 100),
        $point = $rect.children();
    pat_blk.setFieldValue(ox, 'OX');
    pat_blk.setFieldValue(oy, 'OY');
    $point.css('left', (50+ox)+'%').css('top', (50+oy)+'%');
  });

  // TODO ------------ selected is atx_click_ui ------------
  // canvas.addEventListener('click', function(evt){
  //   var blk = Blockly.selected;
  //   if (blk == null || blk.type != 'atx_click_ui') { return; }
  // });

  // ------------ selected is atx_swipe -----------
  var swipe_points = {start:null, end:null};
  canvas.addEventListener('mousedown', function(evt){
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_swipe') { return; }
    swipe_points.start = evt;
    swipe_points.end = null;
  });
  canvas.addEventListener('mousemove', function(evt){
    if (evt.movementX == 0 && evt.movementY == 0) { return; }
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_swipe' || swipe_points.start == null) { return; }
    swipe_points.end = evt;
    var spos = getMousePos(this, swipe_points.start),
        epos = getMousePos(this, swipe_points.end);
        p1 = getCanvasPos(spos.x, spos.y),
        p2 = getCanvasPos(epos.x, epos.y);
    // update blockly model
    blk.setFieldValue(spos.x, 'SX');
    blk.setFieldValue(spos.y, 'SY');
    blk.setFieldValue(epos.x, 'EX');
    blk.setFieldValue(epos.y, 'EY');
    // update line
    var $svg = $("#overlays-swipe").children('svg'),
        cstart = '<circle cx="'+p1.left+'" cy="'+p1.top+'" fill="black" r="3"></circle>'
        cend = '<circle cx="'+p2.left+'" cy="'+p2.top+'" fill="white" r="3"></circle>'
        line = '<line stroke="black" stroke-width="2"' +
               ' x1="'+p1.left+'" y1="'+p1.top +
               '" x2="'+p2.left+'" y2="'+p2.top+'"></line>';
    $svg.html(cstart + line + cend);
  });
  canvas.addEventListener('mouseup', function(evt){
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_swipe') { return; }
    swipe_points.start = null;
    swipe_points.end = null;
  });
  canvas.addEventListener('mouseout', function(evt){
    var blk = Blockly.selected;
    if (blk == null || blk.type != 'atx_swipe') { return; }
    swipe_points.start = null;
    swipe_points.end = null;
  });

  //------------ canvas show rect/points for special block ------------//
  function getBlockOverlayData(blk) {
    switch (blk.type) {
      // return {x, y}
      case 'atx_click':
        var x = parseInt(blk.getFieldValue('X')),
            y = parseInt(blk.getFieldValue('Y'));
        if (x != null && y != null) {
          return {x, y};
        } else {
          return null;
        }
      // return {x1, y1, x2, y2, c}
      case 'atx_click_image':
        var pat_conn = blk.getInput('ATX_PATTERN').connection.targetConnection;
        if (pat_conn == null) { return null;}
        var pat_blk = pat_conn.sourceBlock_;
        if (pat_blk.type != 'atx_image_pattern_offset') {return null;}
        var img_conn = pat_blk.getInput('FILENAME').connection.targetConnection;
        if (img_conn == null) { return null;}
        var img_blk = img_conn.sourceBlock_;
        if (img_blk.type != 'atx_image_crop_preview') {return null;}
        var crop_conn = img_blk.getInput('IMAGE_CROP').connection.targetConnection;
        if (crop_conn == null) { return null;}
        var imagename = img_blk.getFieldValue('IMAGE'),
            crop_blk = crop_conn.sourceBlock_,
            left = parseInt(crop_blk.getFieldValue('LEFT')),
            top = parseInt(crop_blk.getFieldValue('TOP')),
            width = parseInt(crop_blk.getFieldValue('WIDTH')),
            height = parseInt(crop_blk.getFieldValue('HEIGHT')),
            ox = parseInt(pat_blk.getFieldValue('OX')),
            oy = parseInt(pat_blk.getFieldValue('OY'));
            return {x1: left, y1: top, x2: left+width, y2: top+height, c:{x:ox, y:oy}};
      // TODO return {x1, y1, x2, y2}
      case 'atx_click_ui':
      // return {x1, y1, x2, y2}
      case 'atx_swipe':
        var x1 = parseInt(blk.getFieldValue('SX')),
            y1 = parseInt(blk.getFieldValue('SY')),
            x2 = parseInt(blk.getFieldValue('EX')),
            y2 = parseInt(blk.getFieldValue('EY'));
            return {x1, y1, x2, y2};
      default:
        return null;
    }
  }

  function hideOverlayPart(type) {
    if (!overlays.hasOwnProperty(type)) {return;}
    var obj = overlays[type];
    obj.$el.hide();
  }

  function showOverlayPart(type, blk) {
    if (!overlays.hasOwnProperty(type)) {return;}
    var obj = overlays[type];
    var data = getBlockOverlayData(blk)
    if (data != null) {
      obj.update(data);
      obj.$el.show();
    }
  }

  function onUISelectedChange(evt){
    if (evt.type != Blockly.Events.UI || evt.element != 'selected') {return;}
    // track selected to run special statement, (statement blocks: nextConnection != null)
    if (Blockly.selected && Blockly.selected.nextConnection) {
      vm.blockly.selected = Blockly.selected.id;
    } else {
      vm.blockly.selected = null;
    }
    if (evt.oldValue != null) {
      var oldblk = workspace.getBlockById(evt.oldValue);
      if (oldblk === null) { return;}
      hideOverlayPart(oldblk.type);
    } else {
      $('#screen-crop').hide();
      $('#btn-save-screen').attr('disabled', 'disabled');
    }
    if (evt.newValue != null) {
      var newblk = workspace.getBlockById(evt.newValue);
      showOverlayPart(newblk.type, newblk);
      useBlockScreen(newblk);
    } else {
      useBlockScreen();
      crop_bounds.bound = null;
      $('#screen-crop').css({'left':'0px', 'top':'0px',
          'width':'0px', 'height':'0px'}).show();
      $('#btn-save-screen').removeAttr('disabled');
    }
  }
  workspace.addChangeListener(onUISelectedChange);

  // track screenshot related to each block
  var block_screen = {};
  function useBlockScreen(blk) {
    var conn;
    if (blk && blk.type == 'atx_click_image') {
      conn = blk.getInput('ATX_PATTERN').connection.targetConnection;
      blk = conn && conn.sourceBlock_;
    }
    if (blk && blk.type == 'atx_image_pattern_offset') {
      conn = blk.getInput('FILENAME').connection.targetConnection;
      blk = conn && conn.sourceBlock_;
    }
    if (blk && blk.type == 'atx_image_crop_preview') {
      conn = blk.getInput('IMAGE_CROP').connection.targetConnection;
      blk = conn && conn.sourceBlock_;
    }
    var screen = blk && block_screen[blk.id];
    if (!screen & vm.device.latest_screen == '') {
      return;
    }
    var url = window.blocklyBaseURL + (screen || vm.device.latest_screen);
    vm.loadScreen(url);
  }

  function onUIFieldChange(evt) {
    if (evt.type != Blockly.Events.CHANGE || evt.element != 'field') {return;}
    vm.blockly.dirty = true;
    var blk = workspace.getBlockById(evt.blockId);
    if (blk.type == 'atx_image_crop' && evt.name == 'FILENAME') {
      block_screen[evt.blockId] = evt.newValue;
    }
  }
  function onCreateBlock(evt){
    if (evt.type != Blockly.Events.CREATE) {return;}
    vm.blockly.dirty = true;
    for (var i = 0, bid; i < evt.ids.length; i++) {
      bid = evt.ids[i];
      var blk = workspace.getBlockById(bid);
      if (blk.type == 'atx_image_crop') {
        block_screen[bid] = blk.getFieldValue('FILENAME');
      }
    }
  }
  function onDeleteBlock(evt){
    if (evt.type != Blockly.Events.DELETE) {return;}
    vm.blockly.dirty = true;
    for (var i = 0, bid; i < evt.ids.length; i++) {
      bid = evt.ids[i];
      delete block_screen[bid];
    }
  }
  function onBlockConnectionChange(evt) {
    if (evt.type != Blockly.Events.MOVE && !evt.oldParentId && !evt.newParentId) {
      return;
    }
    vm.blockly.dirty = true;
    var oldblk = evt.oldParentId ? workspace.getBlockById(evt.oldParentId) : null,
        newblk = evt.newParentId ? workspace.getBlockById(evt.newParentId) : null;
    // TODO: update block_screen
    if (oldblk) {

    }
    if (newblk) {

    }
  }
  function onCommentChange(evt) {
    if (evt.type != Blockly.Events.Change && evt.element != 'comment') {
      return;
    }
    vm.blockly.dirty = true;
  }
  workspace.addChangeListener(onCreateBlock);
  workspace.addChangeListener(onDeleteBlock);
  workspace.addChangeListener(onUIFieldChange);
  workspace.addChangeListener(onBlockConnectionChange);
  workspace.addChangeListener(onCommentChange);

  /*--------------- resize handle ----------------*/
  function setupResizeHandle(){
    $('#resize-handle').on('drag', function(evt){
      var x = evt.originalEvent.pageX;
      if (x <= 0) { return; }
      var p = 1 - (evt.originalEvent.pageX - 30)/(vm.layout.width-60);
      vm.layout.right_portion = Math.min(55, Math.max(parseInt(p*100), 25));
      vm.layout.width = $('#main-content').width()+30; // with margin 15+15
    });
  }
  setupResizeHandle();
});
