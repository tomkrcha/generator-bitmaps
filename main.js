/*
    The MIT License (MIT)
    
    Copyright (c) 2013 Tom Krcha
    
    Permission is hereby granted, free of charge, to any person obtaining a copy of
    this software and associated documentation files (the "Software"), to deal in
    the Software without restriction, including without limitation the rights to
    use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
    the Software, and to permit persons to whom the Software is furnished to do so,
    subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
    FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
    COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
    IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
    CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
    Working with bitmaps in Adobe Generator

    Created by Tom Krcha
    http://twitter.com/tomkrcha
    http://facebook.com/tomkrcha
    http://tomkrcha.com
*/


(function () {
    "use strict";

    var PLUGIN_ID = require("./package.json").name,
        MENU_ID = "bitmaps",
        MENU_LABEL = "$$$/JavaScripts/Generator/Bitmaps/Menu=Bitmaps";

    var _document = null;
    
    var _generator = null,
        _currentDocumentId = null,
        _config = null;

    var fs = require('fs'),
        path = require('path'),
        //JPEG = require('jpeg').Jpeg,
        PNG = require('pngjs').PNG; // https://npmjs.org/package/pngjs


    /*********** INIT ***********/

    function init(generator, config) {
        _generator = generator;
        _config = config;

        console.log("initializing generator bitmaps tutorial with config %j", _config);
        
        _generator.addMenuItem(MENU_ID, MENU_LABEL, true, false).then(
            function () {
                console.log("Menu created", MENU_ID);
            }, function () {
                console.error("Menu creation failed", MENU_ID);
            }
        );
        _generator.onPhotoshopEvent("generatorMenuChanged", handleGeneratorMenuClicked);

        function initLater() {
            requestEntireDocument();
            
        }
        process.nextTick(initLater);

    }

    /*********** EVENTS ***********/

    function handleGeneratorMenuClicked(event) {
        // Ignore changes to other menus
        var menu = event.generatorMenuChanged;
        if (!menu || menu.name !== MENU_ID) {
            return;
        }

        requestEntireDocument();

        var startingMenuState = _generator.getMenuState(menu.name);
        console.log("Menu event %s, starting state %s", stringify(event), stringify(startingMenuState));
    }

    /*********** CALLS ***********/

    function requestEntireDocument(documentId) {
        if (!documentId) {
            console.log("Determining the current document ID");
        }
        
        _generator.getDocumentInfo(documentId).then(
            function (document) {
                //getFirstLayerBitmap(document);
                getFlattenedDocumentBitmap(document);

            },
            function (err) {
                console.error("[Tutorial] Error in getDocumentInfo:", err);
            }
        ).done();
    }

    function getFirstLayerBitmap(document){
        _document = document;

        console.log(_document.id,_document.layers[0].id);
        _generator.getPixmap(_document.id,_document.layers[0].id,{}).then(
        function(pixmap){
            console.log("got Pixmap: "+pixmap.width+" x "+pixmap.height);
            console.log(stringify(pixmap));
            savePixmap(pixmap);

        },
        function(err){
            console.error("err pixmap:",err);
        }).done();
    }

    

    function getFlattenedDocumentBitmap(document){
        _document = document;

        console.log("getFlattenedDocumentBitmap");

        // A little bit of Alchemy
        // sendDocumentThumbnailToNetworkClient (flattened preview of currently opened doc)
        var str = 'var idNS = stringIDToTypeID("sendDocumentThumbnailToNetworkClient" );'+
                   'var desc1 = new ActionDescriptor();'+
                   'desc1.putInteger( stringIDToTypeID( "width" ), app.activeDocument.width );'+// width
                   'desc1.putInteger( stringIDToTypeID( "height" ), app.activeDocument.height );'+// height
                   'desc1.putInteger( stringIDToTypeID("format"), 2 );'+ // FORMAT: 2=pixmap, 1=jpeg
                   'executeAction( idNS, desc1, DialogModes.NO );'+
                   // set document units to PIXELS, users often use POINTS, so we force it to PIXELS
                   'app.preferences.rulerUnits = Units.PIXELS;'+
                   // we return back the current width and height as string divided by a comma
                   // the value of the last line always gets returned back
                   'app.activeDocument.width+","+app.activeDocument.height;';

        var pixmap = {};

        _generator._photoshop.on("pixmap", function (messageID, messageBody) { // , rawMessage)
                // documentThumbnail always comes in RGB, without Alpha element
                pixmap.channelCount = 3;
                pixmap.pixels = messageBody;
                pixmap.pixels.parent = {};
                console.log("pixmap");
                console.log("length: "+pixmap.pixels.length);
                console.log("pixmap: "+pixmap.pixels[12]);

                for(var i=0;i<200;i++){
                    console.log(i+": "+pixmap.pixels[i]);
                }

        });

         _generator.evaluateJSXString(str).then(
            function(result){
                // get width and height
                var obj = result.split(",");
                pixmap.width = parseInt(obj[0]);
                pixmap.height = parseInt(obj[1]);

                // divider value is on 12th byte
                var divider = pixmap.pixels[12]; // 16 or 32 or more
                console.log("divider: "+divider);

                // reconstruct buffer by bitmap size multiplied by 4 for RGBA
                var len = pixmap.width*pixmap.height*4;
                var rgbaPixels = new Buffer(len);

                console.log("len: "+len);

                var pixels = pixmap.pixels;

                // first 16 bytes of pixmap is header, skip it
                var n = 16;
                for(var i=0;i<len;i+=4){
                    // console.log("writing..."+i+", pixel: "+pixels[n]+", "+pixels[n+1]+", "+pixels[n+2]);
                    rgbaPixels.writeUInt8(pixels[n], i);
                    rgbaPixels.writeUInt8(pixels[n+1], i+1);
                    rgbaPixels.writeUInt8(pixels[n+2], i+2);
                    // Add Alpha
                    rgbaPixels.writeUInt8(255, i+3);
//                    rgbaPixels.writeUInt8(pixels[n+3], i+3);

                    n+=3;
                    // detect the new line and skip bytes by 1 (16) or 2 (32)
                    if(i%pixmap.width==1){
                        //console.log("i%width: "+(i%pixmap.width));

                        if(divider==16){
                            n+=1;
                        }else if(divider==32){
                            n+=2;
                        }//else nothing... can be higher
                    }
                }

                console.log("buffer written...");
                //console.log(rgbaPixels);

                console.log("PNG packing...");
                var png = new PNG({
                    width: pixmap.width,
                    height: pixmap.height
                });

                // set pixel data
                png.data = rgbaPixels;
                png.pack().pipe(fs.createWriteStream(path.resolve(__dirname, 'out.png')));
                //
                console.log("PNG written");
            },
            function(err){
                console.log(err);
            });
    }

    /*********** HELPERS ***********/
    function savePixmap(pixmap){
        var pixels = pixmap.pixels;
        var len = pixels.length,
            channels = pixmap.channelCount;

        // convert from ARGB to RGBA, we do this every 4 pixel values (channelCount) 
        for(var i=0;i<len;i+=channels){
            var a = pixels[i];
            pixels[i]   = pixels[i+1];
            pixels[i+1] = pixels[i+2];
            pixels[i+2] = pixels[i+3];
            pixels[i+3] = a;
        }

        // init a new PNG
        var png = new PNG({
            width: pixmap.width,
            height: pixmap.height
        });

        // set pixel data
        png.data = pixmap.pixels;

        // write to a file (will write out.png to the same directory as this *.js file
        png.pack().pipe(fs.createWriteStream(path.resolve(__dirname, 'out.png')));
    }

    function sendJavascript(str){
        _generator.evaluateJSXString(str).then(
            function(result){
                console.log(result);
            },
            function(err){
                console.log(err);
            });
    }

    function setCurrentDocumentId(id) {
        if (_currentDocumentId === id) {
            return;
        }
        console.log("Current document ID:", id);
        _currentDocumentId = id;
    }

    function stringify(object) {
        try {
            return JSON.stringify(object, null, "    ");
        } catch (e) {
            console.error(e);
        }
        return String(object);
    }

    exports.init = init;

    // Unit test function exports
    exports._setConfig = function (config) { _config = config; };
    
}());