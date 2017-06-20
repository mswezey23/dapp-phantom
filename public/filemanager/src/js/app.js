(function(window, angular, $) {
    'use strict';

    /**
     * Angular modules
     */	
	
	var modules = ['liskApp', 'pascalprecht.translate', 'ngFileUpload'].filter(function(module) {
	  try {
		return !!angular.module(module);  
	  } catch (e) {
//		console.log('Module isn\'t loaded: ', module);		  
	  }
	});
	angular.module('FileManagerApp', modules);
	
    /**
     * jQuery inits
     */	 
	
    $(window.document).ready(function() {
		return; // disabled
        window.setTimeout(function() {
			$('#wizard').modal('show');
		}, 1000);
    });	 
	
    $(window.document).on('shown.bs.modal', '.modal', function() {
        window.setTimeout(function() {
            $('[autofocus]', this).focus();
        }.bind(this), 100);
    });

    $(window.document).on('click', function() {
        $('#context-menu').hide();
    });

    $(window.document).on('contextmenu', '.main-navigation .table-files tr.item-list:has("td"), .item-list', function(e) {
        var menu = $('#context-menu'), 
			posX = e.pageX, // e.clientX
			posY = e.pageY;

        if (posX >= window.innerWidth - menu.width()) {
            posX -= menu.width();
        }
        if (posY >= window.innerHeight - menu.height()) {
            posY -= menu.height();
        }

        menu.hide().css({
            left: posX,
            top: posY
        }).show();
				
        e.preventDefault();
    });

    if (! Array.prototype.find) {
        Array.prototype.find = function(predicate) {
            if (this == null) {
                throw new TypeError('Array.prototype.find called on null or undefined');
            }
            if (typeof predicate !== 'function') {
                throw new TypeError('predicate must be a function');
            }
            var list = Object(this);
            var length = list.length >>> 0;
            var thisArg = arguments[1];
            var value;

            for (var i = 0; i < length; i++) {
                value = list[i];
                if (predicate.call(thisArg, value, i, list)) {
                    return value;
                }
            }
            return undefined;
        };
    }
 
})(window, angular, jQuery);
