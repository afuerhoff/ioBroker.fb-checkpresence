'use strict';
/*eslint no-undef: "error"*/
/*eslint-env browser*/

let familymembers = [];
let whitelist = [];
let arr;
let dlgMembers;
let dlgWl;
let secret;
let active = false;

if (typeof _ !== 'function') _ = translateWord;

function encrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

function decrypt(key, value) {
    let result = '';
    for (let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}	

function search(event) {
    const input = document.getElementById(event.currentTarget.id);
    const filter = input.value.toUpperCase();
    let table = null;
    if( event.currentTarget.id == 'searchFam'){
        table = document.getElementById('tabFam');
    }else{
        table = document.getElementById('tabWL');
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
    histArr = await getHistoryAdapter(histArr);
    histArr = await getSqlAdapter(histArr);
    histArr = await getInfluxdbAdapter(histArr);
    let selectElement = document.getElementById('history');
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

function getHistoryAdapter (hist) {
    return new Promise((resolve, reject) => {
        getAdapterInstances('history', function (arr) {
            //let hist=[];
            for (let i = 0; i < arr.length; i++) {
                hist.push({'name' : arr[i]._id});
            }
            resolve(hist);
        });
    });
}

function getSqlAdapter (hist) {
    return new Promise((resolve, reject) => {
        getAdapterInstances('sql', function (arr) {
            //let hist=[];
            for (let i = 0; i < arr.length; i++) {
                hist.push({'name' : arr[i]._id});
            }
            resolve(hist);
        });
    });
}

function getInfluxdbAdapter (hist) {
    return new Promise((resolve, reject) => {
        getAdapterInstances('influxdb', function (arr) {
            //let hist=[];
            for (let i = 0; i < arr.length; i++) {
                hist.push({'name' : arr[i]._id});
            }
            resolve(hist);
        });
    });
}

// This will be called by the admin adapter when the settings page loads
function load(settings, onChange) {
    if (!settings) return;
    $('.hideOnLoad').hide();
    $('.showOnLoad').show();
    familymembers = settings.familymembers || [];
    whitelist = settings.whitelist || [];
    values2table('values', familymembers, onChange, tableOnReady);
    values2table('whitevalues', whitelist, onChange);
    
    getHistoryInstances(settings);
    
    // if adapter is alive
    socket.emit('getState', 'system.adapter.' + adapter + '.' + instance + '.alive', function (err, state) {
        active =  (state && state.val);
        if (!active) {
            const content = '<div class="modal-content"><h4>' + _('Error') + '</h4><p>' + _('You have to start your ioBroker.' + adapter + ' adapter before you can use this function!') + '</p></div><div class="modal-footer"><a href="#!" class="modal-close waves-effect waves-green btn-flat">Close</a></div>';
            $('.modal').append(content);
            $('.modal').modal();
            return;
        }

        const g_onChange = onChange;
        sendTo(adapter + '.' + instance, 'discovery', { onlyActive: true, reread: false }, function (result) {
            try {
                arr = JSON.parse(result);
                if (arr.error) {
                    const content = '<div class="modal-content"><h4>' + _('Error') + '</h4><p>' + arr.error.message + '</p></div><div class="modal-footer"><a href="#!" class="modal-close waves-effect waves-green btn-flat">Close</a></div>';
                    $('.modal').append(content);
                    $('.modal').modal();
                    return;
                }
                let bodyFam = '';
                let bodyWl = '';
                if (!arr.length) {
                    const content = '<div class="modal-content"><h4>' + _('Add a familymember') + '</h4><p>' + _('Cannot find any device') + '</p></div><div class="modal-footer"><a href="#!" class="modal-close waves-effect waves-green btn-flat">Close</a></div>';
                    $('.modal').append(content);
                    $('.modal').modal();
                    return;
                } else {
                    dlgMembers=
                        '<div class="input-field col s12">' + 
                            '<i id="icon" class="material-icons prefix">search</i>' + 
                            '<input id="searchFam" class="validate" type="text" onkeyup="search(event)">'  + 
                            '<label for="searchFam">' + _('Search for device') + '..' + '</label>' +
                        '</div>' +
                        '<div col s12>' + 
                            '<table class="responsive-table highlight" id="tabFam">' + 
                                '<thead>' + 
                                    '<tr class="grey darken-3 white-text">' + 
                                        '<th class="valign-wrapper"><label><input type="checkbox" class="filled-in" id="select-all" onclick="select-all(event)"/><span></span></label></th>' + 
                                        '<th class="left-align">' + 'Hostname' + '</th>' + 
                                        '<th class="center-align">' + _('MAC address') + '</th>' + 
                                        '<th class="center-align">' + _('IP address') + '</th>' + 
                        //'<th class="valign-wrapper"><label><input type="checkbox" class="filled-in" id="insertIP" /><span class="white-text" style="font-size: 13px">' + _('IP address') + '</span></th>' +
                                    '</tr>' + 
                                '</thead>' +
                                '<tbody>';
                    dlgWl=
                        '<div class="input-field col s12">' + 
                            '<i id="icon" class="material-icons prefix">search</i>' + 
                            '<input id="searchWL" class="validate" type="text" onkeyup="search(event)">'  + 
                            '<label for="searchWL">' + _('Search for device') + '..' + '</label>' +
                        '</div>' +
                        '<div col s12>' + 
                            '<table class="responsive-table striped" id="tabWL">' + 
                                '<thead>' + 
                                    '<tr class="grey darken-3 white-text">' + 
                                        '<th class="valign-wrapper"><label><input type="checkbox" class="filled-in" id="select-all2" onclick="select-all(event)"/><span></span></label></th>' + 
                                        '<th class="left-align">' + 'Hostname' + '</th>' + 
                                        '<th class="center-align">' + _('MAC address') + '</th>' + 
                                    '</tr>' + 
                                '</thead>' +
                                '<tbody>';
                    arr.forEach(function (element) {
                        let chkVal = '';
                        for(let i=0; i < whitelist.length; i++){
                            if (element.mac == whitelist[i].white_macaddress){
                                chkVal = 'checked';
                                break;
                            }
                        }
                        let chkVal2 = false;
                        for(let i=0; i < familymembers.length; i++){
                            if(familymembers[i].useip == false){
                                if (element.mac == familymembers[i].macaddress){
                                    chkVal2 = 'checked';
                                    break;
                                }
                            }else{
                                if (element.ip == familymembers[i].ipaddress){
                                    chkVal2 = 'checked';
                                    break;
                                }
                            }
                        }
                        bodyFam += 
                        '<tr class="add-device" ' +
                            'data-macaddress="' + (element.mac || '') + '" ' +
                            'data-familymember="' + (element.name || '').replace(/"/g, '\"') + '" ' +
                            'data-ip="' + (element.ip || '').replace(/"/g, '\"') + '">' +
                            '<td class="valign-wrapper"><label><input class="filled-in" type="checkbox" name="chkFM"' + chkVal2 + ' /><span></span></label></td>' +
                            '<td>' + element.name + '</td>' +
                            '<td class="center">' + element.mac + '</td>' +
                            '<td class="center">' + element.ip + '</td>' +
                        '</tr>';
                        bodyWl += 
                            '<tr ' +
                                'data-white_macaddress="' + (element.mac || '') + '" ' +
                                'data-white_device="' + (element.name || '').replace(/"/g, '\"') + '">' +
                                '<td class="valign-wrapper"><label><input class="filled-in" type="checkbox" name="chkWL"' + chkVal + ' /><span></span></label></td>' +
                                '<td>' + element.name + '</td>' +
                                '<td class="center">' + element.mac + '</td>' +
                            '</tr>';
                    });
                    bodyFam += '</tbody></table></div>';
                    const contentFam = 
                        '<div class="modal-content translate">' + 
                            '<h5 class="blue">' + _('Add family member') + '</h5>' + 
                            '<p>' + dlgMembers + bodyFam + '</p>' + 
                        '</div>' + 
                        '<div class="modal-footer blue lighten-2">' + 
                            '<!--a href="#!" class="modal-action modal-close btn-default waves-effect waves-light btn-flat"><i class="material-icons left">close</i>' + _('Close') + '</a-->' + 
                            '<button type="button" class="modal-action modal-close waves-effect waves-light btn-flat" id="save"><i class="material-icons left">save</i>' + _('Add') + '</button>' + 
                            '<button type="button" class="modal-close btn-default offset-s2 waves-effect waves-light btn-flat"><i class="material-icons left">close</i>' + _('Close') + '</button>' + 
                        '</div>';
                    bodyWl += '</tbody></table></div>';
                    const contentWl = 
                        '<div class="modal-content col s12 translate">' + 
                            '<h5 class="blue" style="margin-top:20px">' + _('Add a device') + '</h5>' + 
                            '<p>' + dlgWl + bodyWl + '</p>' + 
                        '</div>' + 
                        '<div class="modal-footer blue lighten-2">' + 
                            '<button type="button" class="modal-action modal-close waves-effect waves-light btn-flat" id="save1"><i class="material-icons left">save</i>' + _('Add') + '</button>' + 
                            '<button type="button" class="modal-close btn-default offset-s2 waves-effect waves-light btn-flat"><i class="material-icons left">close</i>' + _('Close') + '</button>' + 
                        '</div>';
                    $('#dlgFam').append(contentFam);
                    $('#dlgFam').modal({dismissible: false,});
                    $('#dlgWL').append(contentWl);
                    $('#dlgWL').modal({dismissible: false,});
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
                    //const insertIP = $('#insertIP');
                    $('#tabFam input[type=checkbox]:checked').each(function () {
                        const row = $(this).closest('tr')[0];
                        var ip = $(row).data('ip');
                        var mac = $(row).data('macaddress');
                        let device = $(row).data('familymember');
                        if (device != undefined){
                            let comment = device;
                            let enabled = true;
                            let useip = false;
                            for (let i=0; i<familymembers.length; i++){
                                useip = familymembers[i].useip;
                                if(useip == false){
                                    if (familymembers[i].macaddress == mac){
                                        device = familymembers[i].familymember;
                                        enabled = familymembers[i].enabled;
                                        comment = familymembers[i].comment;
                                        break;
                                    }
                                }else{
                                    if (familymembers[i].ipaddress == ip){
                                        device = familymembers[i].familymember;
                                        enabled = familymembers[i].enabled;
                                        comment = familymembers[i].comment;
                                        break;
                                    }
                                }
                            }
                            devices.push({macaddress: mac, ipaddress: ip, enabled: enabled, familymember: device, useip: useip, comment: comment});
                        }
                    });
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
                        /*$(':checkbox').each(function() {
                            this.checked = false;                       
                        });*/
                    }
                });
                $('#select-all2').click(function(event) {
                    if(this.checked) {
                        // Iterate each checkbox
                        const checkboxes = document.querySelectorAll('input[name="chkWL"]');
                        for (let i=0; i<checkboxes.length; i++) {
                            checkboxes[i].checked = true;
                        }
                        /*$(':checkbox').each(function() {
                            this.checked = true;                        
                        });*/
                    } else {
                        const checkboxes = document.querySelectorAll('input[name="chkWL"]');
                        for (let i=0; i<checkboxes.length; i++) {
                            checkboxes[i].checked = false;
                        }
                        /*$(':checkbox').each(function() {
                            this.checked = false;                       
                        });*/
                    }
                });
            } catch (e) {
                const content = '<div class="modal-content"><h4>Error</h4><p>Cannot find any device</p></div><div class="modal-footer"><a href="#!" class="modal-close waves-effect waves-green btn-flat">Close</a></div>';
                $('.modal').append(content);
                $('.modal').modal();
            }
        });
    });

    // example: select elements with id=key and class=value and insert value
    socket.emit('getObject', 'system.config', function (err, obj) {
        secret = (obj.native ? obj.native.secret : '') || 'SdoeQ85NTrg1B0FtEyzf';
        //for (var key in settings) {
        //if (settings.hasOwnProperty(key)) setValue(key, settings[key], onChange);
        //}
        $('.value').each(function () { 
            const $key = $(this);
            const id = $key.attr('id');
            if ($key.attr('type') === 'checkbox') {
                // do not call onChange direct, because onChange could expect some arguments
                $key.prop('checked', settings[id])
                    .on('change', () => onChange())
                ;
            } else {
                let val;
                if ($key.data('crypt') =='1'){
                    val = decrypt(secret, settings[id]) ;
                } else{
                    val = settings[id];
                }
                //alert("Error1 " + val);

                $key.val(val) //settings[id]
                    .on('change', () => onChange())
                    .on('keyup', () => onChange())
                ;
            }
        });
        onChange(false);
        // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:
        if (M) M.updateTextFields();
        $('select').select();
    });
}

function beforeOpen(){
    // check checkboxes
    const fm = table2values('values') || [];
    for(let i = 0; i<fm.length;i++){
        $('#tabFam input[type=checkbox]').each(function () {
            const row = $(this).closest('tr')[0];
            const mac = $(row).data('macaddress');
            if(mac != 'undefined'){
                if(mac == fm[i].macaddress){
                    $(this).prop('checked', true);
                }
            }
        });
    }
    // Open add dialog
    const elems = document.getElementById('dlgFam');
    const instance = M.Modal.getInstance(elems);
    instance.open();
    //instance.destroy();
}

function tableOnReady() {
    $('#values .table-values .values-buttons[data-command="delete"]').on('click', function () {
        const id = $(this).data('index');
        const mac = $('#values .values-input[data-name="macaddress"][data-index="' + id + '"]').val();
        $('#tabFam input[type=checkbox]:checked').each(function () {
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
                obj[$this.attr('id')] = $this.data('crypt') && $this.val() ? encrypt(secret, $this.val()) : $this.val();
                break;					
        }
    });
    // Get table
    obj.familymembers = table2values('values');
    obj.whitelist = table2values('whitevalues');
    callback(obj);
}
