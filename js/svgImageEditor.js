var ImageEditor = {
    Views: {},
    Models: {},
    Collections: {},
    Helpers: {}
};

$(function () {

    ImageEditor.Helpers.templateHelper = function(id) {
        return _.template( $("#" + id).html() );
    };

    ImageEditor.SvgBackboneView = Backbone.View.extend({
        nameSpace: "http://www.w3.org/2000/svg",
        _ensureElement: function() {
            if (!this.el) {
                var attrs = _.extend({}, _.result(this, 'attributes'));
                if (this.id) attrs.id = _.result(this, 'id');
                if (this.className) attrs['class'] = _.result(this, 'className');
                var $el = $(window.document.createElementNS(_.result(this, 'nameSpace'), _.result(this, 'tagName'))).attr(attrs);
                this.setElement($el, false);
            } else {
                this.setElement(_.result(this, 'el'), false);
            }
        }
    });

    /************************************************************************************
     HELPERS
     *************************************************************************************/

    ImageEditor.Helpers.createSvgElement = function(tag) {
        return document.createElementNS('http://www.w3.org/2000/svg', tag);
    };

    ImageEditor.Helpers.radians = function (degrees) {
        return degrees * Math.PI / 180;
    };

    ImageEditor.Helpers.degrees = function (radians) {
        return radians * 180 / Math.PI;
    };

    ImageEditor.Helpers.getQuadrantNumber = function(x, y) {
        if(x >= 0 && y >= 0) {
            return 1;
        } else if(x < 0 && y >= 0) {
            return 2;
        } else if(x < 0 && y < 0) {
            return 3;
        } else {
            return 4;
        }
    };

    ImageEditor.Helpers.rotatePointAroundOrigin = function(originX, originY, x, y, angleInRadians) {
        var sin = Math.sin(angleInRadians);
        var cos = Math.cos(angleInRadians);
        var newX = originX + ( cos * (x - originX) - sin * (y - originY) );
        var newY = originY + ( sin * (x - originX) + cos * (y - originY) );
        return {x:newX, y:newY};
    };

    ImageEditor.Helpers.getSize = function(text, fontSize, font) {
        var phantom = $("span#phantomSize");
        if ( ! phantom.length ) {
            phantom = $('<span id="phantomSize">' + text + '</span>')
                .css({
                    'vsibility':'hidden', 'position':'absolute',
                    'left':'-9999px', 'display':'inline'
                }).appendTo( document.body );
        } else {
            phantom.html(text);
        }
        phantom.css({ 'font-size': fontSize, 'fontFamily': font })
        return {width: phantom.width(), height: phantom.height()};
    };

    /*
     * .addClassSVG(className)
     * Adds the specified class(es) to each of the set of matched SVG elements.
     */
    $.fn.addClassSVG = function(className){
        $(this).attr('class', function(index, existingClassNames) {
            var re = new RegExp(className, 'g');
            if ( existingClassNames.match(re) == null ) {
                return existingClassNames + ' ' + className;
            } else {
                return existingClassNames;
            }
        });
        return this;
    };

    /*
     * .removeClassSVG(className)
     * Removes the specified class to each of the set of matched SVG elements.
     */
    $.fn.removeClassSVG = function(className){
        $(this).attr('class', function(index, existingClassNames) {
            var names = className.split(' ');
            var re;
            var result = existingClassNames;
            for(var i=0; i<className.split(' ').length; i++) {
                re = new RegExp(names[i], 'g');
                result = result.replace(re, '');
            }
            return result.trim();
        });
        return this;
    };

    $.fn.swapToBottom = function() {
        this.parent().prepend(this.siblings());
        return this;
    };

    /************************************************************************************
     MODELS
     *************************************************************************************/

    ImageEditor.Models.ImageEditor = Backbone.Model.extend({
        defaults: {
            screenWidth: 500,
            screenHeight: 500,
            draggingOutside: true
        }
    });

    var layerLastId = 0;

    ImageEditor.Models.Layer = Backbone.Model.extend({
        defaults: {
            id: 0,
            x: 'center',
            y: 'center',
            width: 0,
            height: 0,
            halfWidth: 0,
            halfHeight: 0,
            rotation: 0,
            scale: 1,
            active: false,

            rotationHandleRadius: 8,
            strokeSize: 4,
            rotationHandleYOffset: -33,
            minDimension: 20,
            handleSize: 15,
            halfHandleSize: 0
        },
        initialize: function() {
            this.on("change:width change:height", this.calculatedValues, this);
            this.calculatedValues();

            if ( this.get("type") == "text" ) {
                var size = ImageEditor.Helpers.getSize(
                    this.get("text"), this.get("textFontSize"), this.get("textFont")
                );
                if ( this.get("width") == 0 && this.get("height") == 0 ) {
                    this.set("width", size.width);
                    this.set("height", size.height);
                }
                this.set("textWidth", size.width);
                this.set("textHeight", size.height);
            }

            // Set layer unique ID
            this.set('id', layerLastId);
            layerLastId += 1;
        },
        destroy: function() {
            this.off("change:width change:height", this.calculatedValues);
        },
        validate: function(attrs) {
            if (attrs.width < this.minDimension ||  attrs.height < this.minDimension) {
                return "Dimension is to small";
            }
        },
        calculatedValues: function() {
            this.set("halfWidth", this.get("width") / 2 );
            this.set("halfHeight", this.get("height") / 2 );
            this.set("halfHandleSize", this.get("handleSize") / 2 );
        }
    });

    ImageEditor.Models.ImageLayer = ImageEditor.Models.Layer.extend({
        defaults: _.extend({}, ImageEditor.Models.Layer.prototype.defaults, {
            type: "image",
            src: ""
        })
    });

    ImageEditor.Models.TextLayer = ImageEditor.Models.Layer.extend({
        defaults: _.extend({}, ImageEditor.Models.Layer.prototype.defaults, {
            type: "text",
            text: "",
            textWidth: 0,
            textHeight: 0,
            textFont: "Arial",
            textFontSize: 16,
            textColor: "#000000"
        })
    });

    /************************************************************************************
     COLLECTIONS
     *************************************************************************************/
    ImageEditor.Collections.Layers = Backbone.Collection.extend({
        initialize: function () {
            // SET ACTIVE LAYER
            this.on("change:active", this.changeActiveLayerStatus, this);
        },

        changeActiveLayerStatus: function (model, options) {
            if ( options == true ) {
                this.forEach(function(mod, index) {
                    if(model != mod)
                        mod.set('active', false);
                });
            }
        }
    });

    /************************************************************************************
     VIEWS
     *************************************************************************************/

    ImageEditor.Views.Init = ImageEditor.SvgBackboneView.extend({
        tagName: "svg",

        events: {
            'click': 'removeActiveStatuses'
        },

        initialize: function (options) {
            this.model = new ImageEditor.Models.ImageEditor();

            this.model.on("change:screenWidth change:screenHeight", this.resizeScreen, this);

            this.model.set('screenWidth', options.screenWidth);
            this.model.set('screenHeight', options.screenHeight);
            this.screenOffsetLeft = options.screenOffsetLeft;
            this.screenOffsetTop = options.screenOffsetTop;

            this.collection.on("add", this.renderLayer, this);

            _.bindAll(this, 'bindKeyboardEvents');
            $(document).bind('keydown', this.bindKeyboardEvents);

            this.render();
        },

        render: function () {
            this.collection.each(this.renderLayer, this);
            return this;
        },

        resizeScreen: function() {
            this.$el.attr("width", this.model.get("screenWidth"));
            this.$el.attr("height", this.model.get("screenHeight"));
        },

        clearScreen: function () {
            this.collection.remove( this.collection.models );
        },

        renderLayer: function (model) {
            var newLayer = new ImageEditor.Views.Layer({
                model: model,
                screenWidth: this.model.get("screenWidth"),
                screenHeight: this.model.get("screenHeight"),
                draggingOutside: this.model.get("draggingOutside")
            });

            this.$el.append(newLayer.el);
        },

        deleteLayer: function (id) {
            var targetLayer = this.collection.find(function(model) {
                return model.get("id") == id;
            });

            this.collection.remove( targetLayer );
        },

        addLayer: function (options) {
            var newLayer = false;

            if ( options.type == 'text' ) {
                newLayer = new ImageEditor.Models.TextLayer(options);
            } else {
                newLayer = new ImageEditor.Models.ImageLayer(options);
            }

            if (newLayer) this.collection.add( newLayer );
            else console.log('layer type is undefined');
        },

        removeActiveStatuses: function(e) {
            if ( $(e.target).closest(".layer").length ) return;
            this.collection.find(function(model) {
                if ( model.get('active') == true ) {
                    model.set('active', false);
                }
            });
        },

        bindKeyboardEvents: function(e) {
            var layer = this.collection.find(function(model) {
                if ( model.get('active') == true ) return model;
            });

            if ( typeof layer == 'undefined' ) return;

            // left
            if ( e.keyCode == 37 ) {
                e.preventDefault();
                layer.set('x', layer.get('x')-2);
            }
            // right
            else if ( e.keyCode == 39 ) {
                e.preventDefault();
                layer.set('x', layer.get('x')+2);
            }
            // up
            else if ( e.keyCode == 38 ) {
                e.preventDefault();
                layer.set('y', layer.get('y')-2);
            }
            // down
            else if ( e.keyCode == 40 ) {
                e.preventDefault();
                layer.set('y', layer.get('y')+2);
            }
            // delete
            else if ( e.keyCode == 46 ) {
                e.preventDefault();
                this.collection.remove( layer );
            }
        }
    });

    ImageEditor.Views.Layer = ImageEditor.SvgBackboneView.extend({
        templates: {
            layer: ImageEditor.Helpers.templateHelper("constructorLayer"),
            transform: _.template( "translate(<%=x%>,<%=y%>) scale(<%=scale%>) rotate(<%=rotation%>)" )
        },
        tagName: "g",
        className: "layer",

        initialize: function (options) {
            this.screenWidth = options.screenWidth;
            this.screenHeight = options.screenHeight;
            this.draggingOutside = options.draggingOutside;

            _.bindAll(this, "rotatableStart", "resizableStart", "draggableStart", "onMoveEvent", "onEndEvent", "onAnimationFrame", "onSizeChange");

            this.documentEl = $(window.document);

            this.model.on("change:x change:y change:rotation change:width change:height", this.onTransformChange, this);
            this.model.on("change:width change:height", this.onSizeChange, this);
            this.model.on("destroy remove", this.remove, this);
            this.model.on("change:active", this.setActiveClass, this);

            if ( this.model.get('x') == 'center' && this.model.get('y') == 'center' ) {
                this.model.set({
                    'x': this.screenWidth / 2,
                    'y': this.screenHeight / 2
                });
            }

            if ( this.model.get("type") == "image" ) {
                this.model.on("change:width change:height change:src", this.onImageChange, this);
            } else {
                this.model.on("change:width change:height", this.onTextSizeChange, this);
                this.model.on("change:textFont change:textFontSize change:textColor", this.onTextStyleChange, this);
            }

            this.$el.attr("data-layer-id", this.model.get("id"));
            this.$el.attr("data-orientation", 'n');

            this.render();
        },

        moveTo: function(x, y) {
            this.model.set({"x": x, "y": y});
        },

        resize: function(width, height) {
            this.model.set({"width": width, "height": height});
        },

        onTransformChange: function() {
            this.$el.attr("transform", this.templates.transform( this.model.attributes ));
        },

        onTextSizeChange: function() {
            var text = this.$el.find("text");

            var w = Math.min(  this.model.get("width") / this.model.get("textWidth") );
            var h = Math.min(  this.model.get("height") / this.model.get("textHeight") );
            var scale = (w || h);

            text.attr({
                "fill": this.model.get("textColor"),
                "transform": "scale(" + scale + ")"
            });
        },

        onTextStyleChange: function() {
            this.$el.find("text").css({
                'font-family': this.model.get('textFont'),
                'font-size': this.model.get('textFontSize'),
                'color': this.model.get('textColor')
            });
        },

        onImageChange: function() {
            this.$el.find("image").attr({
                "x": -this.model.get("halfWidth"), "y": -this.model.get("halfHeight"),
                "height": this.model.get("height"), "width": this.model.get("width")
            });
        },

        onSizeChange: function() {
            //if ( typeof this.draggableHandle == "undefined") return;
            this.draggableHandle.attr({
                "x": -this.model.get("halfWidth"),
                "y": -this.model.get("halfHeight"),
                "width": this.model.get("width"),
                "height": this.model.get("height")
            });

            this.ulResizableHandle.attr({
                x: -this.model.get("halfWidth") - this.model.get("halfHandleSize"),
                y: -this.model.get("halfHeight") - this.model.get("halfHandleSize")
            });

            this.urResizableHandle.attr({
                x: this.model.get("halfWidth") - this.model.get("halfHandleSize"),
                y: -this.model.get("halfHeight") - this.model.get("halfHandleSize")
            });

            this.llResizableHandle.attr({
                x: -this.model.get("halfWidth") - this.model.get("halfHandleSize"),
                y: this.model.get("halfHeight") - this.model.get("halfHandleSize")
            });

            this.lrResizableHandle.attr({
                x: this.model.get("halfWidth") - this.model.get("halfHandleSize"),
                y: this.model.get("halfHeight") - this.model.get("halfHandleSize")
            });

            this.rotatableGroup.attr({
                transform:"translate(0, " + -this.model.get("halfHeight") + ")"
            });
        },

        calculateScreenCenterPoint: function() {
            var rotation = this.model.get("rotation");
            this.model.set("rotation", 0);

            var centerX = ( this.rotatableHandle.offset().left + this.model.get("halfHandleSize"));
            var centerY = ( this.rotatableHandle.offset().top + this.model.get("halfHandleSize") +
            Math.abs(this.model.get("rotationHandleYOffset")) + this.model.get("halfHeight"));

            this.model.set({
                "pageRectCenterX": centerX,
                "pageRectCenterY": centerY,
                "rotation": rotation
            });
        },

        rotatableStart: function(e) {
            e.preventDefault();

            this.calculateScreenCenterPoint();
            this.rotatableHandlerDrag = true;

            this.documentEl.bind("mousemove", this.onMoveEvent);
            this.documentEl.bind("mouseup", this.onEndEvent);
        },

        resizableStart: function(e) {
            e.preventDefault();

            this.calculateScreenCenterPoint();
            this.resizableHandlerDrag = true;

            this.documentEl.bind("mousemove", this.onMoveEvent);
            this.documentEl.bind("mouseup", this.onEndEvent);
        },

        draggableStart: function(e) {
            e.preventDefault();

            this.calculateScreenCenterPoint();
            this.draggableHandlerDrag = true;

            this.startPosX = this.model.get("x");
            this.startPosY = this.model.get("y");
            this.startMouseX = e.pageX;
            this.startMouseY = e.pageY;

            this.documentEl.bind("mousemove", this.onMoveEvent);
            this.documentEl.bind("mouseup", this.onEndEvent);
        },

        onMoveEvent: function(e) {
            this.pendingWidth = this.model.get("width");
            this.pendingHeight = this.model.get("height");
            this.pendingRotation = this.model.get("rotation");
            this.pendingX = this.model.get("x");
            this.pendingY = this.model.get("y");

            var pageX = e.pageX;
            var pageY = e.pageY;

            if(this.rotatableHandlerDrag) {
                this.calculateRectangleRotation(pageX, pageY);
            }
            else if(this.resizableHandlerDrag) {
                this.calculateRectangleSize(pageX, pageY);
            }
            else if(this.draggableHandlerDrag) {
                this.calculateRectanglePosition(pageX, pageY);
            }

            window.requestAnimationFrame(this.onAnimationFrame);
        },

        calculateRectangleRotation: function(pageX, pageY) {
            this.xDelta =  pageX - this.model.get("pageRectCenterX");
            this.yDelta =  this.model.get("pageRectCenterY") - pageY;
            this.pendingRotation = 450 - ImageEditor.Helpers.degrees(Math.atan(this.yDelta/this.xDelta));

            var quadrantNumber = ImageEditor.Helpers.getQuadrantNumber(this.xDelta, this.yDelta);
            var angle = this.pendingRotation-360;
            if ( quadrantNumber == 2 || quadrantNumber == 3 ) {
                angle = angle +180;
            }
            this.setOrientation(angle);

            switch(ImageEditor.Helpers.getQuadrantNumber(this.xDelta, this.yDelta)) {
                case 2:
                case 3:
                    this.pendingRotation += 180;
                    break;
                case 4:
                    this.pendingRotation += 360;
                    break;
            }

        },

        setOrientation: function( angle ) {
            var axisArray = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
            var octant = Math.round(angle/45); // 0 .. 7
            this.$el.attr("data-orientation", axisArray[octant]);
        },

        calculateRectangleSize: function(pageX, pageY) {
            this.rotatedPoint = ImageEditor.Helpers.rotatePointAroundOrigin(
                this.model.get("pageRectCenterX"),
                this.model.get("pageRectCenterY"),
                pageX, pageY,
                ImageEditor.Helpers.radians(-this.model.get("rotation"))
            );

            this.xDelta = Math.abs(this.model.get("pageRectCenterX") -  this.rotatedPoint.x);
            this.yDelta =  Math.abs(this.model.get("pageRectCenterY") -  this.rotatedPoint.y);

            if(this.xDelta < this.model.get("handleSize")) {
                this.xDelta = this.model.get("handleSize");
            }

            if(this.yDelta < this.model.get("handleSize")) {
                this.yDelta = this.model.get("handleSize");
            }

            this.pendingWidth = this.xDelta * 2;
            this.pendingHeight = this.yDelta * 2;

            this.scaleWidthDelta = this.pendingWidth / this.model.get("width");
            this.scaleHeightDelta = this.pendingHeight / this.model.get("height");

            if(this.scaleWidthDelta < this.scaleHeightDelta) {
                this.pendingHeight = this.model.get("height") * this.scaleWidthDelta;
            } else {
                this.pendingWidth = this.model.get("width") * this.scaleHeightDelta;
            }
        },

        calculateRectanglePosition: function(pageX, pageY) {
            this.pendingX = this.startPosX + (pageX - this.startMouseX);
            this.pendingY = this.startPosY + (pageY - this.startMouseY);

            var clientSize = this.draggableHandle[0].getBoundingClientRect();

            if ( ! this.draggingOutside ) {
                if (this.pendingX - clientSize.width/2 < 0) this.pendingX = clientSize.width/2;
                if (this.pendingY - clientSize.height/2 < 0) this.pendingY = clientSize.height/2;

                if (this.pendingX - clientSize.width/2 + clientSize.width > this.screenWidth)
                    this.pendingX = this.screenWidth - clientSize.width + clientSize.width/2;

                if (this.pendingY - clientSize.height/2 + clientSize.height > this.screenHeight)
                    this.pendingY = this.screenHeight - clientSize.height + clientSize.height/2;
            }
        },

        onEndEvent: function(e) {
            e.preventDefault();
            this.rotatableHandlerDrag = false;
            this.resizableHandlerDrag = false;
            this.draggableHandlerDrag = false;
            this.documentEl.unbind("mousemove", this.onMoveEvent);
            this.documentEl.unbind("mouseup", this.onEndEvent);
        },

        onAnimationFrame: function() {
            this.model.set({
                "x": this.pendingX,
                "y": this.pendingY,
                "width": this.pendingWidth,
                height: this.pendingHeight,
                rotation: this.pendingRotation
            });

            if(this.resizableHandlerDrag || this.rotatableHandlerDrag || this.draggableHandlerDrag) {
                window.requestAnimationFrame(this.onAnimationFrame);
            }
        },

        createImageLayer: function() {
            var image = ImageEditor.Helpers.createSvgElement("image");
            image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', this.model.get("src"));
            image.setAttributeNS(null, "preserveAspectRatio", "none");

            this.$el.prepend( image );

            this.onImageChange();
            this.setActiveStatus();
        },

        createTextLayer: function() {
            var text = ImageEditor.Helpers.createSvgElement('text');
            text.textContent = this.model.get('text');

            text.setAttributeNS(null, 'text-anchor', 'middle');
            text.setAttributeNS(null, 'dominant-baseline', 'central');

            this.$el.prepend( text );

            this.onTextStyleChange();
            this.onTextSizeChange();
            this.setActiveStatus();
        },

        setActiveClass: function() {
            if ( this.model.get("active") )
                this.$el.addClassSVG("active");
            else
                this.$el.removeClassSVG("active");
        },

        setActiveStatus: function() {
            this.model.set("active", true);

            // Swap to top (z-index)
            this.$el.swapToBottom();
        },

        remove: function() {
            this.model.destroy();
            this.$el.remove();
        },

        bindEvents: function() {
            $(this.draggableHandle).bind("mousedown", this.draggableStart);
            $(this.draggableHandle).on("mousedown", this.setActiveStatus.bind(this));

            $(this.ulResizableHandle).bind("mousedown", this.resizableStart);
            $(this.urResizableHandle).bind("mousedown", this.resizableStart);
            $(this.llResizableHandle).bind("mousedown", this.resizableStart);
            $(this.lrResizableHandle).bind("mousedown", this.resizableStart);

            $(this.rotatableHandle).bind("mousedown", this.rotatableStart);
        },

        render: function () {
            var svgXml = this.templates.layer(this.model.attributes);
            var svgFragment = $.parseXML(svgXml);

            // write children to svg, using backbone view root tag instead
            while(svgFragment.documentElement.childElementCount > 0) {
                this.el.appendChild(svgFragment.documentElement.childNodes[0]);
            }

            if ( this.model.get("type") == "image" ) this.createImageLayer();
            else this.createTextLayer();

            this.draggableHandle = this.$el.find("[class~='draggable-handle']");

            this.ulResizableHandle = this.$el.find("[class~='ul-resizable-handle']");
            this.urResizableHandle = this.$el.find("[class~='ur-resizable-handle']");
            this.llResizableHandle = this.$el.find("[class~='ll-resizable-handle']");
            this.lrResizableHandle = this.$el.find("[class~='lr-resizable-handle']");

            this.rotatableGroup = this.$el.find("[class~='rotatable-group']");
            this.rotatableHandle = this.$el.find("[class~='rotatable-handle']");

            //this.model.set({"height": 60});
            this.bindEvents();
            this.onSizeChange();
            this.onTransformChange();
        }
    });
});