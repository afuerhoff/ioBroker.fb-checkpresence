'use strict';
/* eslint-disable no-irregular-whitespace */
/* eslint-disable-next-line no-undef */
/* eslint-env jquery, browser */               // https://eslint.org/docs/user-guide/configuring#specifying-environments
/* global sendTo, getEnums, common, systemLang, socket, values2table, table2values, M, _, instance */  // for eslint
/*eslint no-undef: "error"*/
/*eslint-env browser*/

const adapterNamespace = `fb-checkpresence.${instance}`;

let familymembers = [];
let whitelist = [];
let arr;
let active = false;

if (typeof _ !== 'function') _ = translateWord;

function search(event) {
    const input = document.getElementById(event.currentTarget.id);
    const filter = input.value.toUpperCase();
    let table = null;
    if( event.currentTarget.id == 'searchDevice'){
        table = document.getElementById('tabDevices');
        // Enable "reset search" button
        $('button#btnResetSearch').attr('disabled', false);
    }
    if( event.currentTarget.id == 'searchWL'){
        table = document.getElementById('tabWl');
        $('button#btnResetSearchWl').attr('disabled', false);
    }
    const tr = table.getElementsByTagName('tr');
    // Loop through all table rows, and hide those who don't match the search query
    for (let i = 0; i < tr.length; i++) {
        const td = tr[i].getElementsByTagName('td')[1]; //search in second column
        if (td) {
            const txtValue = td.textContent || td.innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                tr[i].style.display = '';
            } else {
                tr[i].style.display = 'none';
            }
        }
    }
}

/*function setValue(id, value, onChange) {
    const $value = $('#' + id + '.value');
    if ($value.attr('type') === 'checkbox') {
        $value.prop('checked', value).change(function() {
            onChange();
        });
    } else {
        const val = $value.data('crypt') && value ? decrypt(secret, value) : value;
        $value.val(val).change(function() {
            onChange();
        }).keyup(function() {
            // Check that only numbers entered
            if ($(this).hasClass('number')) {
                const val = $(this).val();
                if (val) {
                    let newVal = '';
                    for (let i = 0; i < val.length; i++) {
                        if (val[i] >= '0' && val[i] <= '9') {
                            newVal += val[i];
                        }
                    }
                    if (val != newVal) $(this).val(newVal);
                }
            }
            onChange();
        });
    }
}*/

async function getHistoryInstances(settings){
    let histArr =[];
    histArr = await getHistoryAdapter('history', histArr);
    histArr = await getHistoryAdapter('sql', histArr);
    histArr = await getHistoryAdapter('influxdb', histArr);
    const selectElement = document.getElementById('history');
    const cnfHistory = settings.history;
    let option = document.createElement('option');
    option.text = 'disabled';
    option.value = '';
    selectElement.options[0] = option;
    for (let i = 0; i < histArr.length; i++) {
        option = document.createElement('option');
        const  str = histArr[i].name.replace('system.adapter.', '');
        option.text = str;
        option.value = str;
        selectElement.options[i+1] = option;
        if (cnfHistory == str){
            selectElement.selectedIndex = i+1;
        }
    }
    $('select').select();
}

function getHistoryAdapter (adapter, hist) {
    return new Promise((resolve, reject) => {
        getAdapterInstances(adapter, function (arr) {
            for (let i = 0; i < arr.length; i++) {
                hist.push({'name' : arr[i]._id});
            }
            resolve(hist);
        });
    });
}


// Field is valid?
function chkValidity() {
    let valid = true;

    $('.value').each(function() {
        const $key = $(this);
        const element = document.getElementById($key.attr('id'));

        if ($key.attr('type') !== 'checkbox' && !element.checkValidity()) {
            valid = false;
        }
    });
    return valid;
}

function dlgError(text){
    const content = 
        '<div class="modal-header">' + 
            '<h6 class="dlgErrorTitle"><span>' + _('Error') + '</span></h6>' +
        '</div>' + 
        '<div class="modal-content">' +
            '<p class="errorText">' + _(text) + '</p>' + 
        '</div>' + 
        '<div class="modal-footer">' + 
            '<a class="btnDlg modal-action modal-close waves-effect waves-green btn-small btn-close"><i class="large material-icons left">close</i><span class="translate">' + _('Close') + '</span></a>' +                            
        '</div>';
    $('#dlgDevices').append(content);
    $('#dlgDevices').modal();
    $('#dlgWL').append(content);
    $('#dlgWL').modal();
}

function dlgDevices(arr, title, id){
    let tableBodyDevices = '';
    arr.forEach(function (element) {
        const chkVal2 = '';

        //onMessage -> allDevices name, mac, ip -> see main.js
        tableBodyDevices += 
            '<tr class="add-device" ' +
                'data-macaddress="' + (element.mac || '') + '" ' +
                'data-familymember="' + (element.name || '').replace(/"/g, '\"') + '" ' +
                'data-ip="' + (element.ip || '').replace(/"/g, '\"') + '">' +
                '<td class="valign-wrapper"><label><input class="filled-in" type="checkbox" name="chkFM"' + chkVal2 + ' /><span></span></label></td>' +
                '<td>' + element.name + '</td>' +
                '<td class="center">' + element.mac + '</td>' +
                '<td class="center">' + element.ip + '</td>' +
            '</tr>';
    });

    const dialogDevices = 
        '<div class="modal-header">' + 
            '<h6 class="dlgTitle"><span class="translate">' + _(title) + '</span></h6>' +
            '<div class="input-field inline">' + 
                '<i id="icon" class="material-icons prefix">search</i>' + 
                '<button id="btnResetSearch" disabled="disabled" class="btn-floating btn-small waves-effect waves-green"><i class="material-icons">clear</i></button>' +
                '<input id="searchDevice" name="search" class="validate searchInput" type="text" onkeyup="search(event)">'  + 
                '<label class="searchLabel" for="searchDevice">' + _('Search for device') + '..' + '</label>' +
            '</div>' +
            '<div>' + 
                '<table class="fm">' + 
                    '<thead>' + 
                        '<tr class="header">' +
                            '<th class="valign-wrapper header"><label class="header"><input type="checkbox" class="cb filled-in header" id="select-all" onclick="select-all(event)"/><span></span></label></th>' + 
                            '<th class="header left-align">' + 'Hostname' + '</th>' + 
                            '<th class="header center-align">' + _('Mac-address') + '</th>' + 
                            '<th class="header center-align">' + _('Ip-address') + '</th>' + 
                        '</tr>' + 
                    '</thead>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div class="modal-content">' +
            '<div>' + 
                '<table class="fm" id="tabDevices">' + 
                    '<tbody>' +
                        tableBodyDevices +
                    '</tbody>' +
                '</table>' +
            '</div>' +
        '</div>' + 
        '<div class="modal-footer">' + 
            '<a class="btnDlg modal-action modal-close waves-effect waves-green btn-small btn-set" id="save"><i class="large material-icons left">add</i><span class="translate">' + _('Add') + '</span></a>' +
            '<a class="btnDlg modal-action modal-close waves-effect waves-green btn-small btn-close"><i class="large material-icons left">close</i><span class="translate">' + _('Close') + '</span></a>' +                            
        '</div>';

    $(id).append(dialogDevices);
    $(id).modal({dismissible: false});
}

function dlgWl(arr, title, id){
    let tableBodyWl = '';
    arr.forEach(function (element) {
        let chkVal = '';
        for(let i=0; i < whitelist.length; i++){
            if (element.mac == whitelist[i].white_macaddress){
                chkVal = 'checked';
                break;
            }
        }

        //onMessage -> allDevices name, mac, ip -> see main.js
        tableBodyWl += 
            '<tr ' +
                'data-white_macaddress="' + (element.mac || '') + '" ' +
                'data-white_device="' + (element.name || '').replace(/"/g, '\"') + '">' +
                '<td class="valign-wrapper"><label><input class="filled-in" type="checkbox" name="chkWL"' + chkVal + ' /><span></span></label></td>' +
                '<td>' + element.name + '</td>' +
                '<td class="center">' + element.mac + '</td>' +
            '</tr>';
    });

    const dialogWl=
        '<div class="modal-header">' + 
            '<h6 class="dlgTitle"><span class="translate">' + _(title) + '</span></h6>' +
            '<div class="input-field inline">' + 
                '<i id="icon" class="material-icons prefix">search</i>' + 
                '<button id="btnResetSearchWl" disabled="disabled" class="btn-floating btn-small waves-effect waves-green"><i class="material-icons">clear</i></button>' +
                '<input id="searchWL" name="search" class="validate searchInput" type="text" onkeyup="search(event)">'  + 
                '<label class="searchLabel" for="searchWL">' + _('Search for device') + '..' + '</label>' +
            '</div>' +
            '<div>' + 
                '<table class="fm">' + 
                    '<thead>' + 
                        '<tr class="header">' +
                            '<th class="header valign-wrapper"><label><input type="checkbox" class="filled-in" id="select-all2" onclick="select-all(event)"/><span></span></label></th>' + 
                            '<th class="header left-align">' + 'Hostname' + '</th>' + 
                            '<th class="header center-align">' + _('Mac-address') + '</th>' + 
                        '</tr>' + 
                    '</thead>' +
                '</table>' +
            '</div>' +
        '</div>' +
        '<div class="modal-content col s12 translate">' + 
            '<div>' + 
                '<table class="fm" id="tabWl">' + 
                    '<tbody>' +
                        tableBodyWl +
                    '</tbody>' +
                '</table>' +
            '</div>' +
        '</div>' + 
        '<div class="modal-footer">' + 
            '<a class="btnDlg modal-action modal-close waves-effect waves-green btn-small btn-set" id="save1"><i class="large material-icons left">add</i><span class="translate">' + _('Add') + '</span></a>' +
            '<a class="btnDlg modal-action modal-close waves-effect waves-green btn-small btn-close"><i class="large material-icons left">close</i><span class="translate">' + _('Close') + '</span></a>' +                            
        '</div>';

    $(id).append(dialogWl);
    $(id).modal({dismissible: false,});
}

// This will be called by the admin adapter when the settings page loads
async function load(settings, onChange) {
    try {
        if (!settings) return;
        //$('.hideOnLoad').hide();
        familymembers = settings.familymembers || [];
        whitelist = settings.whitelist || [];
        values2table('values', familymembers, onChange, tableOnReady);
        values2table('whitevalues', whitelist, onChange);
        
        getHistoryInstances(settings); //fill select options

        // Secret für Passwortverschlüsselung abfragen
        //const obj = await emitAsync('getObject', 'system.config');
        //if (obj){
        //secret = (obj.native ? obj.native.secret : '') || 'SdoeQ85NTrg1B0FtEyzf';
        $('.value').each(function () {
            const $key = $(this);
            const id = $key.attr('id');

            if ($key.attr('type') === 'checkbox') {
                // do not call onChange direct, because onChange could expect some arguments
                $key.prop('checked', settings[id]).on('change', function(){
                    if (chkValidity()) {
                        onChange();
                    } else {
                        onChange(false);
                    }
                }); //=> onChange())
            } else {
                let val;
                if ($key.data('crypt') =='1'){
                    //val = decrypt(secret, settings[id]) ;
                    val = settings[id];
                } else{
                    val = settings[id];
                }

                $key.val(val).on('change', function(){ //=> onChange())
                    if (chkValidity()) {
                        onChange();
                    } else {
                        onChange(false);
                    }
                }).on('keyup', function(){ //=> onChange())
                    if (chkValidity()) {
                        onChange();
                    } else {
                        onChange(false);
                    }
                }); 
            }
        });
        //}
        $('select').select();
        if (M) M.updateTextFields();
        onChange(false);

        // if adapter is alive
        const state = await emitAsync('getState', 'system.adapter.' + adapter + '.' + instance + '.alive');
        active =  (state && state.val);
        if (!active) {
            dlgError('You have to start your ioBroker.' + adapter + ' adapter before you can use this function!');
        }else{
            const g_onChange = onChange;
            const result = await sendToAsync('getDevices', { onlyActive: true, reread: true });
            if (result != null) {    
                arr = JSON.parse(result);
                if(arr  || arr.result == true){
                    dlgDevices(arr, 'Add family member', '#dlgDevices');
                    dlgWl(arr, 'Add a device', '#dlgWL');
                }else{
                    dlgError('Can not read devices! Result = false');
                    return false;
                }

                $('#save1').click(function () {
                    // Loop through all checkboxes, and add all devices with selected checkboxes
                    whitelist = []; //clear whitelist
                    $('#tabWL input[type=checkbox]:checked').each(function () {
                        const row = $(this).closest('tr')[0];
                        const mac = $(row).data('white_macaddress');
                        const device = $(row).data('white_device');
                        if (device != null){
                            whitelist.push({white_macaddress: mac, white_device: device});
                            values2table('whitevalues', whitelist, g_onChange);
                            g_onChange(true);
                        }
                    });
                });

                $('#save').click(function () {
                    // Loop through all checkboxes, and add all devices with selected checkboxes
                    const devices = []; //clear whitelist
                    //familymembers = settings.familymembers || [];
                    familymembers = table2values('values') || [];

                    $('#tabDevices input[type=checkbox]:checked').each(function () {
                        const row = $(this).closest('tr')[0];
                        const ip = $(row).data('ip');
                        const mac = $(row).data('macaddress');
                        const device = $(row).data('familymember');
                        if (device != undefined){
                            let comment = '';
                            let enabled = true;
                            let famname = device;
                            let usefilter = false;
                            let usage = 'MAC';
                            let group = '';
                            for (let i=0; i<familymembers.length; i++){
                                usage = familymembers[i].usage;
                                if(usage == 'MAC'){
                                    if (familymembers[i].macaddress == mac){
                                        //device = familymembers[i].familymember;
                                        enabled = familymembers[i].enabled;
                                        comment = familymembers[i].comment;
                                        usefilter = familymembers[i].usefilter;
                                        famname = familymembers[i].familymember;
                                        usage = familymembers[i].usage;
                                        group = familymembers[i].group;
                                        break;
                                    }
                                }
                                if(usage == 'IP'){
                                    if (familymembers[i].ipaddress == ip){
                                        //device = familymembers[i].familymember;
                                        enabled = familymembers[i].enabled;
                                        comment = familymembers[i].comment;
                                        usefilter = familymembers[i].usefilter;
                                        famname = familymembers[i].familymember;
                                        usage = familymembers[i].usage;
                                        group = familymembers[i].group;
                                        break;
                                    }
                                }
                                if(usage == 'Hostname'){
                                    if (familymembers[i].devicename == device){
                                        //device = familymembers[i].familymember;
                                        enabled = familymembers[i].enabled;
                                        comment = familymembers[i].comment;
                                        usefilter = familymembers[i].usefilter;
                                        famname = familymembers[i].familymember;
                                        usage = familymembers[i].usage;
                                        group = familymembers[i].group;
                                        break;
                                    }
                                }
                            }           
                            devices.push({group: group, devicename: device, macaddress: mac, ipaddress: ip, usage: usage, usefilter: usefilter, enabled: enabled, familymember: famname, comment: comment});
                        }
                    });
                    for (let i=0; i<familymembers.length; i++){
                        let enabled = familymembers[i].enabled;
                        let comment = '';
                        let famname = '';
                        let usefilter = false;
                        let usage = 'MAC';
                        let group = '';
                        let mac;
                        let ip;
                        let device;
                        if(enabled === false){
                            device = familymembers[i].devicename;
                            mac = familymembers[i].macaddress;
                            ip = familymembers[i].ipaddress;
                            enabled = familymembers[i].enabled;
                            comment = familymembers[i].comment;
                            usefilter = familymembers[i].usefilter;
                            famname = familymembers[i].familymember;
                            usage = familymembers[i].usage;
                            group = familymembers[i].group;
                            devices.push({group: group, devicename: device, macaddress: mac, ipaddress: ip, usage: usage, usefilter: usefilter, enabled: enabled, familymember: famname, comment: comment});
                        }
                    }
                    values2table('values', devices, g_onChange, tableOnReady);
                    g_onChange(true);
                });
                $('#select-all').click(function(event) {
                    if(this.checked) {
                        // Iterate each checkbox
                        const checkboxes = document.querySelectorAll('input[name="chkFM"]');
                        for (let i=0; i<checkboxes.length; i++) {
                            checkboxes[i].checked = true;
                        }
                    } else {
                        const checkboxes = document.querySelectorAll('input[name="chkFM"]');
                        for (let i=0; i<checkboxes.length; i++) {
                            checkboxes[i].checked = false;
                        }
                    }
                });
                $('#select-all2').click(function(event) {
                    if(this.checked) {
                        // Iterate each checkbox
                        const checkboxes = document.querySelectorAll('input[name="chkWL"]');
                        for (let i=0; i<checkboxes.length; i++) {
                            checkboxes[i].checked = true;
                        }
                    } else {
                        const checkboxes = document.querySelectorAll('input[name="chkWL"]');
                        for (let i=0; i<checkboxes.length; i++) {
                            checkboxes[i].checked = false;
                        }
                    }
                });
                $('button#btnResetSearch').click(function(){
                    $('input[name=search]').val('');
                    const table = document.getElementById('tabDevices');
                    const tr = table.getElementsByTagName('tr');
                    // Loop through all table rows, and hide those who don't match the search query
                    for (let i = 0; i < tr.length; i++) {
                        tr[i].style.display = '';
                    }                    
                    $('button#btnResetSearch').attr('disabled', true);
                });
                $('button#btnResetSearchWl').click(function(){
                    $('input[name=search]').val('');
                    const table = document.getElementById('tabWl');
                    const tr = table.getElementsByTagName('tr');
                    // Loop through all table rows, and hide those who don't match the search query
                    for (let i = 0; i < tr.length; i++) {
                        tr[i].style.display = '';
                    }                    
                    $('button#btnResetSearchWl').attr('disabled', true);
                });
            }else{
                dlgError('Can not read devices! Result = null');
            }
        }
        // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:

        //$('.showOnLoad').show();
    } catch (e) {
        dlgError('Cannot find any device! ' + e.message);
        return;
    }
}

//dependency between fbdevices and meshinfo
//checking of meshinfo only valid if fbdevices are selected
$(document).ready(function(){ 
    //includeHTML();
    document.getElementById('buttonadd').addEventListener('click', beforeOpen);

    $('#meshinfo').change(function() 
    {
        if(this.checked == true)
        {
            const x = document.getElementById('fbdevices');
            x.checked = true;
        }
    });   
    $('#guestinfo').change(function() 
    {
        if(this.checked == true)
        {
            const x = document.getElementById('fbdevices');
            x.checked = true;
        }
    });   
    $('#fbdevices').change(function() 
    {
        if(this.checked == false)
        {
            let x = document.getElementById('meshinfo');
            x.checked = false;
            x = document.getElementById('guestinfo');
            x.checked = false;
        }
    });
    $('.collapsible').collapsible();
    $('.tooltipped').tooltip();
    if (M) M.updateTextFields();
});

function beforeOpen(){
    // check checkboxes
    const fm = table2values('values') || [];
    for(let i = 0; i<fm.length;i++){
        $('#tabDevices input[type=checkbox]').each(function () {
            const row = $(this).closest('tr')[0];
            const mac = $(row).data('macaddress');
            const ip = $(row).data('ipaddress');
            const dn = $(row).data('familymember');
            //const usage = $(row).data('usage');
            if (mac && mac == fm[i].macaddress && fm[i].usage === 'MAC' && fm[i].enabled === true){
                $(this).prop('checked', true);
            }
            if (ip && ip == fm[i].ipaddress && fm[i].usage === 'IP' && fm[i].enabled === true){
                $(this).prop('checked', true);
            }
            if (dn && dn == fm[i].familymember && mac && mac == fm[i].macaddress && fm[i].usage === 'Hostname' && fm[i].enabled === true){
                $(this).prop('checked', true);
            }
        });
    }
    // Open add dialog
    let elems = document.getElementById('dlgDevices');
    let instance = M.Modal.getInstance(elems);
    instance.open();

    elems = document.getElementById('dlgWl');
    instance = M.Modal.getInstance(elems);
    instance.open();
    //instance.destroy();
}

function tableOnReady() {
    $('#values .table-values .values-buttons[data-command="delete"]').on('click', function () {
        const id = $(this).data('index');
        const mac = $('#values .values-input[data-name="macaddress"][data-index="' + id + '"]').val();
        $('#tabDevices input[type=checkbox]:checked').each(function () {
            const row = $(this).closest('tr')[0];
            const dlgMac = $(row).data('macaddress');
            if (mac == dlgMac){
                $(this).prop('checked', false);
            }
        });
    });
}

// This will be called by the admin adapter when the user presses the save button
function save(callback) {
    // example: select elements with class=value and build settings object
    const obj = {};

    $('.value').each(function () {
        const $this = $(this);
        switch ($this.attr('type')) {
            case 'checkbox':
                obj[$this.attr('id')] = $this.prop('checked');
                break;
            case 'number':	
                obj[$this.attr('id')] = parseInt($this.val(), 10);
                break;
            default:
                //obj[$this.attr('id')] = $this.data('crypt') && $this.val() ? encrypt(secret, $this.val()) : $this.val();
                obj[$this.attr('id')] = $this.val();
                break;					
        }
    });
    // Get table
    obj.familymembers = table2values('values');
    obj.whitelist = table2values('whitevalues');
    callback(obj);
}

function sendToAsync(cmd, obj) {
    return new Promise((resolve, reject) => {
        sendTo(adapterNamespace, cmd, obj, (result) => {
            if (result.error) {
                //console.error('sendToAsync(): ' + result.error);
                reject(null);
            } else {
                resolve(result);
            }
        });
    });
}

function emitAsync(func, id) {
    return new Promise((resolve, reject) => {
        socket.emit(func, id, (err, stateObj) => {
            if (err) {
                console.error('emitAsync(): ' + err);
                reject(null);
            } else {
                resolve(stateObj);
            }
        });
    });
}
