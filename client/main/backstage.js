//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const SilkyView = require('./view');
const keyboardJS = require('keyboardjs');
const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
const Path = require('path');
Backbone.$ = $;

const tarp = require('./utils/tarp');
const pathtools = require('./utils/pathtools');

const host = require('./host');
const ActionHub = require('./actionhub');

const FSEntryListModel = Backbone.Model.extend({
    defaults: {
        items : [ ],
    },
    requestOpen : function(path, type) {
        this.trigger('dataSetOpenRequested', path, type);
    },
    requestSave : function(path, type) {
        this.trigger('dataSetSaveRequested', path, type);
    },
    requestExport : function(path, type) {
        this.trigger('dataSetExportRequested', path, type);
    },
    requestBrowse : function(list, type, directory, filename) {
        this.trigger('browseRequested', list, type, directory, filename);
    }
});

const FSEntryListView = SilkyView.extend({

    initialize : function() {
        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items', this._render, this);
        this.model.on('change:directory', this._render, this);
        this._render();
    },
    events : {
        'click .silky-bs-fslist-entry' : '_itemClicked'
    },
    _render : function() {

        this.$el.addClass('silky-bs-fslist');

        var items = this.model.get('items');

        var html = '';

        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            var name = item.name;
            var path = item.path;
            var location = '';

            if (item.location) {
                location = pathtools.normalise(item.location);
                location = location.replace(/\//g, ' \uFE65 ');
            }
            else if (item.description) {
                location = item.description;
            }

            html += '<div class="silky-bs-fslist-entry" data-path="' + path + '">';
            if (name.endsWith('.omv'))
                html += '    <div class="silky-bs-fslist-entry-icon silky-bs-flist-item-omv-icon"></div>';
            else
                html += '   <div class="silky-bs-fslist-entry-icon"></div>';
            html += '   <div class="silky-bs-fslist-entry-group">';
            html += '       <div class="silky-bs-fslist-entry-name">' + name + '</div>';
            html += '       <div class="silky-bs-fslist-entry-location">' + location + '</div>';
            html += '   </div>';
            html += '</div>';
        }

        this.$el.html(html);
        this.$items = this.$el.find('.silky-bs-fslist-entry');
    },
    _itemClicked : function(event) {
        var target = event.currentTarget;
        var path = $(target).attr('data-path');
        this.model.requestOpen(path, FSItemType.File);
    }
});

var FSItemType = {
    File: 0,
    Folder: 1,
    Drive: 2,
    SpecialFolder: 3
};

var FSEntryBrowserView = SilkyView.extend({

    initialize : function() {
        this._selectedIndex = -1;

        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items', this._render, this);
        this.model.on('change:dirInfo', this._render, this);

        this.$el.addClass('silky-bs-fslist');
        this.$el.attr('tabindex', 0);
        this._createHeader();
        this._render();
    },
    events : {
        'click .silky-bs-fslist-item' : '_itemClicked',
        'dblclick .silky-bs-fslist-item' : '_itemDoubleClicked',
        'click .silky-bs-fslist-browser-back-button' : '_backClicked',
        'click .silky-bs-fslist-browser-save-button' : '_saveClicked',
        'change .silky-bs-fslist-browser-save-filetype' : '_saveTypeChanged',
        'change .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'keyup .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'paste .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'focus .silky-bs-fslist-browser-save-name' : '_nameGotFocus',
        'focus .silky-bs-fslist-browser-save-filetype' : '_focusChanged',
        'click .silky-bs-fslist-browse-button' : '_manualBrowse',
        'keydown' : '_keyPressHandle',
        'keydown .silky-bs-fslist-browser-save-name' : '_nameKeypressHandle'
    },
    _saveTypeChanged : function() {
        var selected = this.$el.find('option:selected');
        this.filterExtensions = selected.data('extensions');
        this._render();
    },
    _validExtension : function(ext) {
        var extOptions = this.$el.find('.silky-bs-fslist-browser-save-filetype option');
        for (let i = 0; i < extOptions.length; i++) {
            let exts = $(extOptions[i]).data('extensions');
            for (let j = 0; j < exts.length; j++) {
                if (('.' + exts[j]) === ext)
                    return i;
            }
        }
        return -1;
    },
    _nameGotFocus: function(event) {
        this._selected = false;
        if (this._selectedIndex !== -1) {
            this.$items[this._selectedIndex].removeClass('silky-bs-fslist-selected-item');
            this._selectedIndex = -1;
        }
    },
    _focusChanged: function(event) {
        this._selected = false;
        if (this._selectedIndex !== -1) {
            this.$items[this._selectedIndex].removeClass('silky-bs-fslist-selected-item');
            this._selectedIndex = -1;
        }
    },
    _orderItems: function(orderby, direction, items) {

        if (items.length <= 1)
            return;

        if (orderby === 'type') {
            for (var i = 0; i < items.length - 1; i++) {
                var item1 = items[i];
                var item2 = items[i + 1];
                if ((direction === 0 && item1[orderby] > item2[orderby]) || (direction === 1 && item1[orderby] < item2[orderby])) {
                    items[i] = item2;
                    items[i+1] = item1;
                    if (i > 1)
                        i -= 2;
                }
            }
        }
    },
    _manualBrowse: function(event) {
        let filename = '';
        let type = 'open';
        if (this.model.clickProcess === 'save' || this.model.clickProcess === 'export') {
            type = 'save';
            filename = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
        }

        let dirInfo = this.model.get('dirInfo');
        let directory = dirInfo.path;

        this.model.requestBrowse(this.model.fileExtensions, type, directory, filename);
    },
    _createFileTypeSelector: function() {
        let html = '';
        html += '           <div class="silky-bs-fslist-browser-save-filetype">';
        html += '               <select class="silky-bs-fslist-browser-save-filetype-inner">';
        for (let i = 0; i < this.model.fileExtensions.length; i++) {
            let exts = this.model.fileExtensions[i].extensions;
            let desc = this.model.fileExtensions[i].description;
            let selected = '';
            if (i === 0)
                selected = 'selected';
            html += "                   <option data-extensions='" + JSON.stringify(exts) + "' " + selected + " value=" + i + ">" + desc + "</option>";
        }
        //html += '                   <option data-extensions="[jasp]" value=".jasp">JASP File (.jasp)</option>';
        html += '               </select>';
        html += '           </div>';
        html += '       </div>';
        return html;
    },
    _createFooter: function() {
        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';
        var html = '';
        html += '<div class="silky-bs-fslist-footer">';

        if (isSaving === false) {
            html += this._createFileTypeSelector();
        }

        html += '</div>';
        this.$footer = $(html);

        this.$el.append(this.$footer);
    },
    _createHeader: function() {
        var html = '';
        html += '<div class="silky-bs-fslist-header">';


        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';

        /////////////////////////////////////////////////////
        var extension = null;

        if (isSaving) {
            html += '   <div class="silky-bs-fslist-save-options" style="display: flex; flex-flow: row nowrap;">';
            html += '       <div style="flex: 1 1 auto;">';

            var path = this.model.suggestedPath;
            var insert = '';
            if (path) {
                extension = Path.extname(path);
                insert = ' value="' + Path.basename(path, extension) + '"';
            }

            html += '           <input class="silky-bs-fslist-browser-save-name" type="text" placeholder="Enter file name here"' + insert + ' />';

            html += this._createFileTypeSelector();

            html += '       <div class="silky-bs-fslist-browser-save-button' + (path ? '' : " disabled-div") + '" style="display: flex; flex: 0 0 auto;">';
            html += '           <div class="silky-bs-flist-save-icon"></div>';
            if (this.model.clickProcess === 'save')
                html += '           <span>Save</span>';
            else if (this.model.clickProcess === 'export')
                html += '           <span>Export</span>';
            html += '       </div>';
            html += '   </div>';
        }

        ////////////////////////////////////////////////

        html += '   <div class="silky-bs-fslist-path-browser">';
        html += '       <div class="silky-bs-fslist-browser-back-button"><span class="mif-arrow-up"></span></div>';
        html += '       <div class="silky-bs-fslist-browser-location" style="flex: 1 1 auto;"></div>';

        if (host.isElectron) {
            html += '       <div class="silky-bs-fslist-browse-button">';
            html += '           <div class="silky-bs-fslist-browser-location-icon silky-bs-flist-item-folder-browse-icon"></div>';
            html += '           <span>Browse</span>';
            html += '       </div>';
        }

        html += '   </div>';

        html += '</div>';
        this.$header = $(html);
        this.$header.find('.silky-bs-fslist-browser-save-name').focus(function() { $(this).select(); } );

        this.$el.append(this.$header);

        this.$itemsList = $('<div class="silky-bs-fslist-items" style="flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; height:100%"></div>');
        this.$el.append(this.$itemsList);

        this.filterExtensions = this.model.fileExtensions[0].extensions;
        if (this.model.clickProcess === 'save' || this.model.clickProcess === 'export') {
            setTimeout(() => {
                this.$header.find('.silky-bs-fslist-browser-save-name').focus();
            }, 50);
        }

        this._createFooter();

        let extValue = this._validExtension(extension);
        if (extValue != -1)
            this.$el.find('.silky-bs-fslist-browser-save-filetype-inner').val(extValue);
    },
    _nameKeypressHandle: function(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Enter':
                this._saveClicked(event);
                event.preventDefault();
                break;
        }
    },
    _render : function() {

        var items = this.model.get('items');
        var dirInfo = this.model.get('dirInfo');

        var path = null;
        if (dirInfo !== undefined)
            path = pathtools.normalise(dirInfo.path).replace(/\//g, ' \uFE65 ');

        this.$header.find('.silky-bs-fslist-browser-location').text(path);

        var html = '';
        this._orderItems('type', 1, items);
        this.$items = [];
        this.$itemsList.empty();

        for (var i = 0; i < items.length; i++) {
            html = '';
            var item = items[i];

            var name = item.name;
            var itemPath = item.path;
            var itemType = item.type;

            if (itemType === FSItemType.File && this._hasValidExtension(name) === false)
                continue;

            html += '<div class="silky-bs-fslist-item">';
            html += '   <div class="silky-bs-flist-item-icon">';
            if (itemType === FSItemType.File) { //file
                if (name.endsWith('.csv'))
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                else if (name.endsWith('.omv'))
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-omv-icon"></div>';
                else if (name.endsWith('.pdf'))
                    html += '       <span class="mif-file-pdf"></span>';
                else
                    html += '       <span class="mif-file-empty"></span>';
            }
            else if (itemType === FSItemType.Folder) //folder
                html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-icon"></div>';
            else if (itemType === FSItemType.SpecialFolder) //special folder
                html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-special-icon"></div>';
            else if (itemType === FSItemType.Drive) //drive
                html += '       <span class="mif-drive"></span>';
            html += '   </div>';
            html += '   <div class="silky-bs-fslist-entry-name">' + name + '</div>';
            html += '</div>';

            var $item = $(html);
            $item.data('name', name);
            $item.data('path', itemPath);
            $item.data('type', itemType);
            $item.data('index', this.$items.length);
            this.$itemsList.append($item);
            this.$items.push($item);
        }

        if (this.$items.length === 0)
            this.$itemsList.append("<span>No recognised data files were found.</span>");
    },
    _itemClicked : function(event) {
        var $target = $(event.currentTarget);
        var itemType = $target.data('type');
        var itemPath = $target.data('path');
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
            this.model.requestOpen(itemPath, itemType);
        else {

            if (this._selectedIndex !== -1)
                this.$items[this._selectedIndex].removeClass('silky-bs-fslist-selected-item');

            this._selectedIndex = $target.data('index');
            var name = $target.data('name');
            $target.addClass('silky-bs-fslist-selected-item');

            this.$header.find('.silky-bs-fslist-browser-save-name').val(name);
            this._nameChanged();
            this._selected = true;
        }
    },
    _keyPressHandle : function(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'ArrowUp':
                this.decrementSelection();
                event.preventDefault();
                break;
            case 'ArrowDown':
                this.incrementSelection();
                event.preventDefault();
                break;
            case 'Enter':
                if (this._selectedIndex !== -1) {
                    var $target = this.$items[this._selectedIndex];
                    var itemType = $target.data('type');
                    var itemPath = $target.data('path');
                    if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
                        this.model.requestOpen(itemPath, itemType);
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
                        this.model.requestSave(itemPath, itemType);
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
                        this.model.requestExport(itemPath, itemType);
                }
                event.preventDefault();
                break;
        }
    },
    incrementSelection: function() {
        if (this._selectedIndex !== -1 && this._selectedIndex !== this.$items.length - 1){
            this.$items[this._selectedIndex].removeClass('silky-bs-fslist-selected-item');
            this._selectedIndex += 1;
            this.$items[this._selectedIndex].addClass('silky-bs-fslist-selected-item');

            var offset = this.$items[this._selectedIndex].position();
            var height = this.$items[this._selectedIndex].height();
            if (offset.top + height > this.$itemsList.height()) {
                var r = this.$itemsList.scrollTop() + (offset.top + height - this.$itemsList.height() + 1);
                this.$itemsList.animate({scrollTop: r}, 100);
            }
        }
    },
    decrementSelection: function() {
        if (this._selectedIndex > 0){
            this.$items[this._selectedIndex].removeClass('silky-bs-fslist-selected-item');
            this._selectedIndex -= 1;
            this.$items[this._selectedIndex].addClass('silky-bs-fslist-selected-item');

            var offset = this.$items[this._selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({scrollTop: this.$itemsList.scrollTop() + offset.top}, 100);
        }
    },
    _itemDoubleClicked : function(event) {
        var $target = $(event.currentTarget);
        var itemType = $target.data('type');
        var itemPath = $target.data('path');
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
            this.model.requestOpen(itemPath, itemType);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
            this.model.requestSave(itemPath, itemType);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
            this.model.requestExport(itemPath, itemType);
    },
    _nameChanged : function(event) {
        let $button = this.$header.find('.silky-bs-fslist-browser-save-button');
        var name = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
        if (name === '')
            $button.addClass('disabled-div');
        else
            $button.removeClass('disabled-div');

    },
    _hasValidExtension : function(name) {
        let found = true;
        if (this.filterExtensions) {
            found = false;
            for (let extIndex = 0; extIndex < this.filterExtensions.length; extIndex++) {
                if (name.endsWith('.' + this.filterExtensions[extIndex])) {
                    found = true;
                    break;
                }
            }
        }
        return found;
    },
    _saveClicked : function(event) {
        var dirInfo = this.model.get('dirInfo');
        if (dirInfo !== undefined) {
            var name = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
            if (name === '')
                return;

            if (this._hasValidExtension(name) === false)
                name = name + '.' + this.filterExtensions[0];
            var path = dirInfo.path + '/' + name;
            if (this.model.clickProcess === 'save')
                this.model.requestSave(path, FSItemType.File);
            else if (this.model.clickProcess === 'export')
                this.model.requestExport(path, FSItemType.File);
            /*var items = this.model.get('items');
            let foundItem = false;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type === FSItemType.File && items[i].name === name && items[i].path === path) {
                    foundItem = true;
                    break;
                }
            }
            if (foundItem === false)
                items.push({ name: name, path: path, type: FSItemType.File });
            this._render();*/
        }
    },
    _backClicked : function(event) {
        var dirInfo = this.model.get('dirInfo');
        if (dirInfo !== undefined) {
            var path = dirInfo.path;
            path = this._calcBackDirectory(path, dirInfo.type);
            this._goToFolder(path);
        }
    },
    _goToFolder: function(path) {
        this.model.requestOpen(path, FSItemType.Folder);
    },
    _calcBackDirectory: function(path, type) {
        var index = -1;
        if (path.length > 0 && path !== '/') {
            index = path.lastIndexOf("/");
            if (index !== -1 && index === path.length - 1)
                index = path.lastIndexOf("/", path.length - 2);
        }

        if (index === -1)
            return "{{Root}}";

        return path.substring(0, index);
    }
});

var InDevelopmentView = SilkyView.extend({
    initialize : function() {
        this.render();
    },
    render: function() {
        this.$el.addClass('silky-under-development');
        this.$el.append('<div class="silky-development-title">' + this.model.title + '</div>');
        this.$el.append('<div class="silky-development-msg">' + this.model.msg + "</div>");
    }
});

var BackstageModel = Backbone.Model.extend({
    defaults: {
        activated : false,
        task : '',
        taskProgress : 0,
        operation : '',
        place : '',
        lastSelectedPlace : '',
        settings : null,
        ops : [ ],
    },
    initialize : function(args) {

        this.instance = args.instance;
        this._hasCurrentDirectory = false;

        this.instance.settings().on('change:recents',
            (event) => this._settingsChanged(event));
        this.instance.settings().on('change:examples',
            (event) => this._settingsChanged(event));

        this.on('change:operation', this._opChanged, this);

        this._recentsListModel = new FSEntryListModel();
        this._recentsListModel.on('dataSetOpenRequested', this.tryOpen, this);

        this._examplesListModel = new FSEntryListModel();
        this._examplesListModel.on('dataSetOpenRequested', this.tryOpen, this);

        this._pcListModel = new FSEntryListModel();
        this._pcListModel.clickProcess = 'open';
        this._pcListModel.fileExtensions = [
            { description: 'Data files', extensions: [
                'omv', 'csv', 'txt', 'sav', 'zsav', 'por',
                'dta', 'sas7bdat', 'xpt', 'jasp',
            ]},
            { description: 'jamovi files (.omv)', extensions: ['omv'] },
            { description: 'CSV (Comma delimited) (.csv, .txt)', extensions: ['csv', 'txt'] },
            { description: 'SPSS files (.sav, .zsav, .por)', extensions: ['sav', 'zsav', 'por'] },
            { description: 'Stata files (.dta, .sas7bdat)', extensions: ['dta', 'sas7bdat'] },
            { description: 'SAS files (.xpt)', extensions: ['xpt'] },
            { description: 'JASP files (.jasp)', extensions: ['jasp'] },
        ];
        this._pcListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcListModel.on('browseRequested', this.tryBrowse, this);

        this._pcSaveListModel = new FSEntryListModel();
        this._pcSaveListModel.clickProcess = 'save';
        this._pcSaveListModel.suggestedPath = null;
        this._pcSaveListModel.fileExtensions = [ { extensions: ['omv'], description: "jamovi file (.omv)" } ];
        this._pcSaveListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcSaveListModel.on('dataSetSaveRequested', this.trySave, this);
        this._pcSaveListModel.on('browseRequested', this.tryBrowse, this);


        this._pcExportListModel = new FSEntryListModel();
        this._pcExportListModel.clickProcess = 'export';
        this._pcExportListModel.suggestedPath = null;
        this._pcExportListModel.fileExtensions = [ { extensions: ['csv'], description: "CSV (Comma delimited) (.csv)" } ];
        this._pcExportListModel.on('dataSetExportRequested', this.tryExport, this);
        this._pcExportListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcExportListModel.on('browseRequested', this.tryBrowse, this);

        this._savePromiseResolve = null;

        ActionHub.get('save').on('request', () => this.requestSave(this.instance.get('path'), true));

        this.attributes.ops = [
            {
                name: 'new',
                title: 'New',
                action: () => { this.requestOpen(''); }
            },
            {
                name: 'open',
                title: 'Open',
                action: () => {
                    let path = this._determineSavePath();
                    return this.setCurrentDirectory(Path.dirname(path));
                },
                places: [
                    //{ name: 'recent', title: 'Recent', model: this._recentsListModel, view: FSEntryListView, separator: true },
                    { name: 'thispc', title: 'This PC', model: this._pcListModel, view: FSEntryBrowserView },
                    //{ name: 'osf',    title: 'OSF', model: { title: "Access to the OSF is under development", msg: "Support for saving your data to the OSF is coming soon!" }, view: InDevelopmentView },
                    { name: 'examples', title: 'Examples', model: this._examplesListModel, view: FSEntryListView, separator: true },
                    //{ name: 'browse', title: 'Browse', action: () => { this._browse('open'); } }
                ]
            },
            {
                name: 'save',
                title: 'Save',
                action: () => {
                    //this._updateSavePath(this.instance.get('path'));
                    this.requestSave(this.instance.get('path'), true);
                }
            },
            {
                name: 'saveAs',
                title: 'Save As',
                action: () => {
                    let path = this._determineSavePath();
                    return this.setCurrentDirectory(Path.dirname(path)).then(() => {
                        this._pcSaveListModel.suggestedPath = path;
                    });
                },
                places: [
                    { name: 'thispc', title: 'This PC', separator: true, model: this._pcSaveListModel, view: FSEntryBrowserView },
                    //{ name: 'osf',    title: 'OSF', separator: true, model: { title: "Saving to the OSF is under development", msg: "Support for saving your data to the OSF is coming soon!" }, view: InDevelopmentView },
                    //{ name: 'browse', title: 'Browse', action: () => { this._browse('saveAs'); } },
                ]
            },
            {
                name: 'export',
                title: 'Export',
                places: [
                    {
                        name: 'dataExport',
                        title: 'Data',
                        separator: true,
                        action: () => {
                            this._pcExportListModel.fileExtensions = [ { extensions: ['csv'], description: "CSV (Comma delimited) (.csv)" } ];
                        },
                        model: this._pcExportListModel,
                        view: FSEntryBrowserView
                    },
                    //{ name: 'excelDoc',    title: 'As Excel document', separator: true, model: { title: "Exporting to an Excel document is under development", msg: "Support for exporting your data to other formats is coming soon!" }, view: InDevelopmentView },
                    {
                        name: 'resultsExport',
                        title: 'Results',
                        action: () => {
                            this._pcExportListModel.fileExtensions = [ { extensions: ['pdf'], description: "Portable Document Format (.pdf)" }, { extensions: ['html', 'htm'], description: "Web Page (.html, .htm)" } ];
                        },
                        model: this._pcExportListModel,
                        view: FSEntryBrowserView
                    },
                    //{ name: 'browse', title: 'Browse', action: () => { this._browse('export'); } }
                ]
            }
        ];
    },
    tryBrowse: function(list, type, directory, filename) {
        if (host.isElectron) {

            var remote = window.require('electron').remote;
            let browserWindow = remote.getCurrentWindow();
            var dialog = remote.dialog;

            let filters = [];
            for (let i = 0; i < list.length; i++)
                filters.push({ name: list[i].description, extensions: list[i].extensions });

            if (type === 'open') {

                dialog.showOpenDialog(browserWindow, { filters: filters, properties: [ 'openFile' ], defaultPath: Path.join(this._osCurrentDirectory, '') }, (fileNames) => {
                    if (fileNames) {
                        var path = fileNames[0].replace(/\\/g, '/');
                        this.requestOpen(path);
                    }
                });
            }
            else if (type === 'save') {

                dialog.showSaveDialog(browserWindow, { filters : filters, defaultPath: Path.join(this._osCurrentDirectory, filename) }, (fileName) => {
                    if (fileName) {
                        fileName = fileName.replace(/\\/g, '/');
                        this.requestSave(fileName, true);
                    }
                });
            }
        }
        else {
            this.trigger("browse_invoker");
        }
    },
    getCurrentOp: function() {
        var names = _.pluck(this.attributes.ops, 'name');
        var index = names.indexOf(this.attributes.operation);

        if (index !== -1)
            return this.attributes.ops[index];
        else
            return null;
    },
    getCurrentPlace: function() {

        var op = this.getCurrentOp();
        if (op === null)
            return null;

        var names = _.pluck(op.places, 'name');
        var index = names.indexOf(this.attributes.place);

        if (index === -1)
            index = 0;

        return op.places[index];
    },
    tryOpen: function(path, type) {
        if (type === FSItemType.File)
            this.requestOpen(path);
        else if (type === FSItemType.Folder || type === FSItemType.Drive || type === FSItemType.SpecialFolder)
            this.setCurrentDirectory(path, type);
    },
    trySave: function(path, type) {
        this.requestSave(path);
    },
    tryExport: function(path, type) {
        this.requestExport(path);
    },
    setCurrentDirectory: function(path, type) {
        return this.instance.browse(path).then(response => {
            let path = response.path;

            this._pcListModel.set('error', response.errorMessage);
            this._pcListModel.set('items', response.contents);
            this._pcListModel.set('dirInfo', { path: path, type: type } );

            this._pcSaveListModel.set('error', response.errorMessage);
            this._pcSaveListModel.set('items', response.contents);
            this._pcSaveListModel.set('dirInfo', { path: path, type: type } );

            this._pcExportListModel.set('error', response.errorMessage);
            this._pcExportListModel.set('items', response.contents);
            this._pcExportListModel.set('dirInfo', { path: path, type: type } );

            this._hasCurrentDirectory = true;
            this._osCurrentDirectory = response.osPath;
        });
    },
    hasCurrentDirectory: function() {
        return this._hasCurrentDirectory;
    },
    _opChanged: function() {

        var op = this.getCurrentOp();
        if (op === null)
            return;

        let promise = null;
        if ('action' in op)
            promise = op.action();

        if ( ! promise)
            promise = Promise.resolve();

        promise.then(() => {
            if ('places' in op) {
                var names = _.pluck(op.places, 'name');
                var index = names.indexOf(this.attributes.lastSelectedPlace);

                if (index === -1)
                    index = names.indexOf(this.attributes.place);

                if (index === -1)
                    index = 0;

                var place = op.places[index].name;
                var old = this.attributes.place;

                this.attributes.place = place;
                setTimeout(() => {
                    this.trigger('change:place');
                }, 0);
            }
        });
    },
    uploadFile: function(file) {

        var data = new FormData();
        data.append('file', file);

        var url = this.get('hostBaseUrl') + 'upload';

        $.ajax({
            url : url,
            type: 'POST',
            data: data,
            xhr: () => {
                var xhr = $.ajaxSettings.xhr();
                xhr.upload.addEventListener('progress', this.progressHandler);
                return xhr;
            },
            processData: false,
            contentType: false,
            cache: false
        });
    },
    requestOpen: function(path) {
        let deactivated = false;
        let deactivate = () => {
            if ( ! deactivated) {
                this.set('activated', false);
                deactivated = true;
            }
        };
        this.instance.open(path)
            .then(deactivate, undefined, deactivate);
    },
    externalRequestSave: function(path, overwrite) {

        // can be called as externalRequestSave(path, overwrite), externalRequestSave(path), externalRequestSave(), externalRequestSave(overwrite)

        // if path is not specified then the current opened path is used. If overwrite is not specified it defaults to false.
        // if overwrite is false and the specified file already exists a popup asks for overwrite.
        // if overwrite is true and the specified file already exists the file is overwritten.

        if (this.get('activated'))
            throw 'This method can only be called from outside of backstage.';

        if (this.instance.attributes.path)
            return this.requestSave(this.instance.attributes.path, true);

        let rej;
        let prom = new Promise((resolve, reject) => {
            this._savePromiseResolve = resolve;
            rej = reject;
        }).then(() => {
            this._savePromiseResolve = null;
        });

        this.requestSave(path, overwrite).catch(() => {
            this.once('change:activated', () => {
                if (this._savePromiseResolve !== null) {
                    this._savePromiseResolve = null;
                    rej();
                }
            });
        });

        return prom;
    },
    requestExport: function(path, overwrite) {
        let options = { export: true };
        this.setSavingState(true);
        this.instance.save(path, options, overwrite)
            .then(() => {
                this.setSavingState(false);
                this.setCurrentDirectory(Path.dirname(path));
                this.set('activated', false);
            }).catch(() => {
                this.setSavingState(false);
                this.set('activated', true);
                this.set('operation', 'export');
            });
    },

    setSavingState: function(saving) {
        let $button = $(document).find('.silky-bs-fslist-browser-save-button');
        if ( ! $button)
            return;

        let $saveIcon = $button.find('.silky-bs-flist-save-icon');
        if (saving) {
            tarp.show('saving', false, 0, 299);
            $button.addClass('disabled-div');
            $saveIcon.addClass('saving-file');
        }
        else {
            tarp.hide('saving');
            $button.removeClass('disabled-div');
            $saveIcon.removeClass('saving-file');
        }
    },
    requestSave: function(path, overwrite) {

        // can be called as requestSave(path, overwrite), requestSave(path), requestSave(), requestSave(overwrite)

        // if path is not specified then the current opened path is used. If overwrite is not specified it defaults to false.
        // if overwrite is false and the specified file already exists a popup asks for overwrite.
        // if overwrite is true and the specified file already exists the file is overwritten.

        if (overwrite === undefined && typeof path === 'boolean') {
            overwrite = path;
            path = null;
        }

        return new Promise((resolve, reject) => {
            if ( ! path) {
                this.set('activated', true);
                this.set('operation', 'saveAs');
                reject();
                return;
            }

            this.setSavingState(true);
            this.instance.save(path, undefined, overwrite)
                .then(() => {
                    this.setSavingState(false);
                    if (this._savePromiseResolve !== null)
                        this._savePromiseResolve();
                    this.set('activated', false);
                    this.trigger('saved');
                    resolve();
                }).catch(error => {
                    this.setSavingState(false);
                    this.set('activated', true);
                    this.set('operation', 'saveAs');
                    reject(error);
                });
        });
    },
    _determineSavePath: function() {
        let path = this.instance.get('path');
        if (path)
            return path;

        path = this.instance.get('importPath');
        if (path) {
            if (path.endsWith('.omv'))
                return path;
            else
                return Path.join(Path.dirname(path), Path.basename(path, Path.extname(path)) + '.omv');
        }

        return Path.join('{{Documents}}', this.instance.get('title') + '.omv');
    },
    _settingsChanged : function(event) {
        if ('recents' in event.changed)
            this._recentsListModel.set('items', event.changed.recents);
        if ('examples' in event.changed)
            this._examplesListModel.set('items', event.changed.examples);
    },
    recentsModel : function() {
        return this._recentsListModel;
    },
    progressHandler : function(evt) {
        console.log(evt);
    },
    completeHandler: function(evt) {
        console.log('complete');
    }
});

var BackstageView = SilkyView.extend({
    className: 'backstage',
    initialize: function() {
        this.$el.attr('tabindex', 0);
        this.render();
        this.model.on("change:activated", this._activationChanged, this);
        this.model.on('change:operation', this._opChanged, this);
        this.model.on('change:place',     this._placeChanged, this);
    },
    events: {
        'click .silky-bs-back-button div' : 'deactivate',
        'keydown' : '_keypressHandle'
    },
    _keypressHandle: function(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Escape':
                this.deactivate();
                break;
        }
    },
    render: function() {

        this.$el.addClass('silky-bs');

        var html = '';

        html += '<div class="silky-bs-op silky-bs-op-panel">';
        html += '    <div class="silky-bs-header">';
        html += '        <div class="silky-bs-back">';
        html += '            <div class="silky-bs-back-button"><div></div></div>';
        html += '        </div>';
        html += '        <div class="silky-bs-logo"></div>';
        html += '    </div>';
        html += '</div>';

        this.$opPanel = $(html);
        this.$opPanel.appendTo(this.$el);

        $('<div class="silky-bs-main"></div>').appendTo(this.$el);

        let createCallback = (place, op) => {
            return (event) => {
                this.model.set('op', op.name);

                if ('action' in place)
                    place.action();

                if ('view' in place) {
                    this.model.set('lastSelectedPlace', place.name);
                    this.model.set('place', place.name);
                }
            };
        };

        let $opList = $('<div class="silky-bs-op-list"></div>');
        var currentOp = null;
        for (let i = 0; i < this.model.attributes.ops.length; i++) {
            let op = this.model.attributes.ops[i];
            let selected = (op.name === this.model.attributes.operation);
            if (selected)
                currentOp = op;

            let $op = $('<div class="silky-bs-menu-item" data-op="' + op.name + '-item"></div>');
            let $opTitle = $('<div class="silky-bs-op-button" data-op="' + op.name + '">' + op.title + '</div>').appendTo($op);



            if ('places' in op) {
                let $opPlaces = $('<div class="silky-bs-op-places"></div>');
                for (let place of op.places) {
                    let $opPlace = $('<div class="silky-bs-op-place" data-op="' + place.name + '"' + '>' + place.title + '</div>');
                    $opPlace.on('click', createCallback(place, op));
                    $opPlaces.append($opPlace);

                }
                $opPlaces.appendTo($op);
            }

            op.$el = $op;
            $op.on('click', op, _.bind(this._opClicked, this));
            $opList.append($op);
        }
        this.$opPanel.append($opList);

        this.$opPanel.append($('<div class="silky-bs-op-separator"></div>'));

        // this.$opPanel.append($('<div class="silky-bs-op-button" data-op="' + 'Examples' + '" ' + '>' + 'Examples' + '</div>'));

        let $op = $('<div class="silky-bs-op-recents-main"></div>');
        let $opTitle = $('<div class="silky-bs-op-header" data-op="' + 'Recent' + '" ' + '>' + 'Recent' + '</div>').appendTo($op);
        let $recentsBody = $('<div class="silky-bs-op-recents"></div>').appendTo($op);
        $op.appendTo(this.$opPanel);

        let recentsModel = this.model.recentsModel();
        let recentsView = new FSEntryListView({el: $recentsBody, model: recentsModel});


        this.$browseInvoker = this.$el.find('.silky-bs-place-invoker');
        this.$ops = this.$el.find('.silky-bs-menu-item');

        this._opChanged();

        //if ('places' in currentOp)
        //    this.main = new BackstagePlaces({ el: ".silky-bs-main", model: this.model });
        this.main = new BackstageChoices({ el: '.silky-bs-main', model : this.model });
    },
    activate : function() {

        keyboardJS.pause();
        this.$el.addClass('activated');

        tarp.show('backstage', true, 0.3).then(
            undefined,
            () => this.deactivate());

        this.model.set('activated', true);

        $('body').find('.app-dragable').addClass('ignore');

        setTimeout(() => {
            this.$el.focus();
        }, 0);
    },
    deactivate : function() {

        keyboardJS.resume();
        tarp.hide('backstage');
        this.$el.removeClass('activated');
        this.$el.removeClass('activated-sub');

        this.model.set('activated', false);

        this._hideSubMenus();

        this.model.set('operation', '');
        this.model.set('place', '');

        $('body').find('.app-dragable').removeClass('ignore');
    },
    _activationChanged : function() {
        if (this.model.get('activated'))
            this.activate();
        else
            this.deactivate();
    },
    _opClicked : function(event) {
        var op = event.data;
        this.model.set('operation', op.name);
    },
    _hideSubMenus : function() {
        if (this.$ops) {
            let $subOps = this.$ops.find('.silky-bs-op-places');
            for (let i = 0; i < $subOps.length; i++) {
                $($subOps[i]).css('height', '');
                $subOps.css('opacity', '');
            }
        }
    },
    _placeChanged : function() {
        let $places = this.$ops.find('.silky-bs-op-place');

        var place = this.model.getCurrentPlace();
        if (place === null)
            $places.removeClass('selected-place');
        else if ('view' in place) {
            $places.removeClass('selected-place');

            var $place = this.$ops.find('[data-op="' + place.name + '"]');

            $place.addClass('selected-place');
        }
    },
    _opChanged : function() {

        this.$ops.removeClass('selected');
        this._hideSubMenus();

        var operation = this.model.get('operation');
        var $op = this.$ops.filter('[data-op="' + operation + '-item"]');
        let $subOps = $op.find('.silky-bs-op-places');
        let $contents = $subOps.contents();
        let height = 0;
        for(let i = 0; i < $contents.length; i++) {
            height += $contents[i].offsetHeight;
        }
        $subOps.css('height', height);
        $subOps.css('opacity', 1);
        $op.addClass('selected');

        if (operation && this.model.get('activated'))
            this.$el.addClass('activated-sub');
        else
            this.$el.removeClass('activated-sub');
    }
});

var BackstageChoices = SilkyView.extend({
    className: 'silky-bs-choices',
    initialize : function() {

        this.model.on('change:place', this._placeChanged, this);

        var html = '';

        html += '<div class="silky-bs-choices-list"></div>';
        html += '<div class="silky-bs-choices-list" style="display: none ;"></div>';

        this.$el.html(html);

        this.$choices = this.$el.find('.silky-bs-choices-list');
        this.$current = $(this.$choices[0]);
        this.$waiting = $(this.$choices[1]);

        this._placeChanged();

        //this._recentList = new FSEntryListView({ el : this.$recentList, model : this.model.recentsModel() });
    },
    _placeChanged : function() {

        var place = this.model.getCurrentPlace();

        if (place === null)
            return;

        var  old = this.current;
        var $old = this.$current;

        if (place.model) {
            this.$current = $('<div class="silky-bs-choices-list" style="display: none; width:100%; height:100%;"></div>');
            this.$current.appendTo(this.$el);
            if (this.current)
                this.current.close();
            this.current = new place.view({ el: this.$current, model: place.model });
            this.$current.fadeIn(200);
        }

        if (place.view === FSEntryBrowserView && this.model.hasCurrentDirectory() === false)
            this.model.setCurrentDirectory('');  // empty string requests default path

        if (old) {
            $old.fadeOut(200);
            setTimeout(function() { old.remove(); }, 200);
        }

        if ('action' in place)
            place.action();
    }
});

module.exports.View = BackstageView;
module.exports.Model = BackstageModel;
