(function(angular, $) {
    'use strict';
	
    angular.module('FileManagerApp').controller('FileManagerCtrl', [
        '$scope', '$rootScope', '$window', '$translate', '$http', 'fileManagerConfig', 'item', 'fileNavigator', 'apiMiddleware',
        function($scope, $rootScope, $window, $translate, $http, fileManagerConfig, Item, FileNavigator, ApiMiddleware) {
		
        var $storage = $window.localStorage;
        $scope.config = fileManagerConfig;
        $scope.editor = false;
        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];        
        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };
        $scope.query = '';
        $scope.fileNavigator = new FileNavigator();
        $scope.apiMiddleware = new ApiMiddleware();
        $scope.uploadFileList = [];
        $scope.viewTemplate = $storage.getItem('viewTemplate') || 'main-table.html';
        $scope.fileList = [];
        $scope.temps = [];

        $scope.$watch('temps', function() {
            if ($scope.singleSelection()) {
                $scope.temp = $scope.singleSelection();
            } else {
                $scope.temp = new Item({rights: 644});
                $scope.temp.multiple = true;
            }
            $scope.temp.revert();
        });
		
        $scope.$watch('config.rootPath', function(newValue, oldValue) {
			var scope = angular.element('div[ng-controller="appController"]').scope(); // liskApp
			scope.$apply(function(){
				scope.rootPath = newValue;
			});
        });		

        $scope.fileNavigator.onRefresh = function() {
            $scope.temps = [];
            $scope.query = '';
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
        };

        $scope.setTemplate = function(name) {
            $storage.setItem('viewTemplate', name);
            $scope.viewTemplate = name;
        };
		
        $scope.setMerkle = function() {
			var name = $scope.merkleRoot;
			var merkle; 
			
			var validHash = function(val){
				return val.substr(0,2) == 'Qm' && val.length == 46;
			}
			
			var validDomain = function(val){
				return (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](?:\.[a-zA-Z]{2,})+$/.test(val));
			}

			if (!validDomain(name) && !validHash(name)) return;

            $scope.apiMiddleware.resolve(name).then(function(data) {
				merkle = data; // IPNS / Domain -> IPFS
			}).catch(function() {
				merkle = name; // IPFS	
			}).finally(function() {
				$scope.merkleRoot = '';
				$scope.fileNavigator.currentPath = [];
				
				if (validHash(merkle)) {
					$scope.config.rootPath = merkle;
					$scope.fileNavigator.refresh();
				}
			});
        };

        $scope.changeLanguage = function (locale) {
            if (locale) {
                $storage.setItem('language', locale);
                return $translate.use(locale);
            }
            $translate.use($storage.getItem('language') || fileManagerConfig.defaultLang);
        };

        $scope.isSelected = function(item) {
            return $scope.temps.indexOf(item) !== -1;
        };

        $scope.selectOrUnselect = function(item, $event) {
            var indexInTemp = $scope.temps.indexOf(item);
            var isRightClick = $event && $event.which == 3;

            if ($event && $event.target.hasAttribute('prevent')) {
                $scope.temps = [];
                return;
            }
            if (! item || (isRightClick && $scope.isSelected(item))) {
                return;
            }
            if ($event && $event.shiftKey && !isRightClick) {
                var list = $scope.fileList;
                var indexInList = list.indexOf(item);
                var lastSelected = $scope.temps[0];
                var i = list.indexOf(lastSelected);
                var current = undefined;
                if (lastSelected && list.indexOf(lastSelected) < indexInList) {
                    $scope.temps = [];
                    while (i <= indexInList) {
                        current = list[i];
                        !$scope.isSelected(current) && $scope.temps.push(current);
                        i++;
                    }
                    return;
                }
                if (lastSelected && list.indexOf(lastSelected) > indexInList) {
                    $scope.temps = [];
                    while (i >= indexInList) {
                        current = list[i];
                        !$scope.isSelected(current) && $scope.temps.push(current);
                        i--;
                    }
                    return;
                }
            }
            if ($event && !isRightClick && ($event.ctrlKey || $event.metaKey)) {
                $scope.isSelected(item) ? $scope.temps.splice(indexInTemp, 1) : $scope.temps.push(item);
                return;
            }
            $scope.temps = [item];
        };

        $scope.singleSelection = function() {
            return $scope.temps.length === 1 && $scope.temps[0];
        };

        $scope.totalSelecteds = function() {
            return {
                total: $scope.temps.length
            };
        };

        $scope.selectionHas = function(type) {
            return $scope.temps.find(function(item) {
                return item && item.model.type === type;
            });
        };

        $scope.prepareNewFolder = function() {
            var item = new Item(null, $scope.fileNavigator.currentPath);
            $scope.temps = [item];
            return item;
        };

        $scope.smartClick = function(item) {
            var pick = false; // $scope.config.allowedActions.pickFiles;
            if (item.isFolder()) {
                return $scope.fileNavigator.folderClick(item);
            }

            if (typeof $scope.config.pickCallback === 'function' && pick) {
                var callbackSuccess = $scope.config.pickCallback(item.model);
                if (callbackSuccess === true) {
                    return;
                }
            }

            if (item.isImage()) {
                if ($scope.config.previewImagesInModal) {
                    return $scope.openImagePreview(item);
                } 
                return $scope.apiMiddleware.download(item, true);
            }
            
            if (item.isEditable()) {
                return $scope.openEditItem(item);
            }
        };

        $scope.openImagePreview = function() {
            var item = $scope.singleSelection();
            $scope.apiMiddleware.apiHandler.inprocess = true;
            $scope.modal('imagepreview', null, true)
                .find('#imagepreview-target')
                .attr('src', $scope.apiMiddleware.getUrl(item))
                .unbind('load error')
                .on('load error', function() {
                    $scope.apiMiddleware.apiHandler.inprocess = false;
                    $scope.$apply();
                });
        };

        $scope.openEditItem = function() {
            var item = $scope.singleSelection();
            $scope.apiMiddleware.getContent(item).then(function(data) {
                item.tempModel.content = item.model.content = data.result;
				
				var textarea = document.getElementById("textview"),
					filetype = item.model.name.substring(item.model.name.lastIndexOf('.')+1, item.model.name.length);
				
				if ($scope.editor) {
					editor = $scope.editor;
					editor.setValue(data.result);				
				} else { 
					textarea.value = data.result;
					var editor = CodeMirror.fromTextArea(textarea, {
					  lineNumbers: true,
					  styleActiveLine: true,
					  lineWrapping: false,
					  indentUnit: 4, 
					  extraKeys: {"Tab": "indentMore", "Shift-Tab": "indentLess"} 
					});
					
					editor.on('change', function(){
						editor.save();
						angular.element(textarea).trigger('change');	
					});	
				}
				
				if (filetype == 'css'){
					editor.setOption("mode", "text/css");
				} else if (filetype == 'js'){			
					editor.setOption("mode", "javascript");
				} else {
					editor.setOption("mode", "text/html");
				}
				
				$scope.editor = editor;
		
				return; // We use CodeMirror now, not Prism

				var prismarea = document.getElementById('prismarea'),
					classname = 'language-';

				if (filetype == 'css' || filetype == 'js'){
					classname+= filetype;
				} else if (filetype == 'xml' || filetype == 'json'){			
					classname+= 'xml';
				} else {
					classname+= 'markup';
				}
				prismarea.className = classname;
				prismarea.innerHTML = data.result.replace(/&/g, "&amp;")
					.replace(/</g, "&lt;")
					.replace(/>/g, "&gt;") + "\n";	
				
				var editor = document.querySelector('pre');
//				editor = bililiteRange.fancyText(editor, Prism.highlightElement);
//				var textareas = document.getElementsByTagName('textarea');
				var textarea = document.getElementById('textview'); // textareas[0];
								
				prismarea.addEventListener('input', function(e) {
					textarea.value = this.textContent || this.innerText;
					angular.element('#'+textarea.id).trigger('change');	
				});

				Prism.hooks.add('complete', function (env) {
					if (!env.code) return;
					
					// Toggle textarea
					env.element.parentNode.style.display = 'block';
					textarea.style.display = 'none';
				
					// Add line numbers
					var pre = env.element.parentNode;
					var clsReg = /\s*\bline-numbers\b\s*/;
					if (!pre || !/pre/i.test(pre.nodeName) ||
							// Abort only if nor the <pre> nor the <code> have the class
						(!clsReg.test(pre.className) && !clsReg.test(env.element.className))
					) {
						return;
					}

					if (env.element.querySelector(".line-numbers-rows")) {
						// Abort if line numbers already exists
						return;
					}

					if (clsReg.test(env.element.className)) {
						// Remove the class "line-numbers" from the <code>
						env.element.className = env.element.className.replace(clsReg, '');
					}
					if (!clsReg.test(pre.className)) {
						// Add the class "line-numbers" to the <pre>
						pre.className += ' line-numbers';
					}

					var match = env.code.match(/\n(?!$)/g);
					var linesNum = match ? match.length + 1 : 1;
					var lineNumbersWrapper;

					var lines = new Array(linesNum + 1);
					lines = lines.join('<span></span>');

					lineNumbersWrapper = document.createElement('span');
					lineNumbersWrapper.setAttribute('aria-hidden', 'true');
					lineNumbersWrapper.className = 'line-numbers-rows';
					lineNumbersWrapper.innerHTML = lines;

					if (pre.hasAttribute('data-start')) {
						pre.style.counterReset = 'linenumber ' + (parseInt(pre.getAttribute('data-start'), 10) - 1);
					}

					env.element.appendChild(lineNumbersWrapper);
				});

				Prism.highlightElement(prismarea);
            });
			
            $scope.modal('edit');
        };

        $scope.modal = function(id, hide, returnElement) {
            var element = $('#' + id);
            element.modal(hide ? 'hide' : 'show');
            $scope.apiMiddleware.apiHandler.error = '';
            $scope.apiMiddleware.apiHandler.asyncSuccess = false;
            return returnElement ? element : true;
        };

        $scope.modalWithPathSelector = function(id) {
            $rootScope.selectedModalPath = $scope.fileNavigator.currentPath;
            return $scope.modal(id);
        };

        $scope.isInThisPath = function(path) {
            var currentPath = $scope.fileNavigator.currentPath.join('/');
            return currentPath.indexOf(path) !== -1;
        };

        $scope.edit = function() {
            $scope.apiMiddleware.edit($scope.singleSelection()).then(function() {
               $scope.fileNavigator.refresh(); // Important: cat new ipfs hash
               $scope.modal('edit', true);
            });
        };
		
        $scope.publish = function() {
			var publishbtn = angular.element("#publishbtn")[0],
				publishtext = publishbtn.innerHTML;
				
			if (publishbtn.getAttribute('disabled')) return; 
			
			publishbtn.setAttribute('disabled', 'disabled');
			publishbtn.innerHTML = 'Publishing..';
			publishbtn.parentNode.className = 'disabled';
			
            $scope.apiMiddleware.publish().then(function(data) {
				var copybtn = '<a href="javascript:void(0)" id="clipboardbtn" data-clipboard-text="" clipboard-success="clipboardSuccess(e);" clipboard-error="clipboardError(e);"><button type="button" class="btn btn-default btn-sm"><span class="glyphicon glyphicon-copy" aria-hidden="true"></span></button></a>';
				var publish2clipboard = new Clipboard('#clipboardbtn', {
				  text: function(trigger) {
					return data.result.Name; 
				  }
				});
				
				Materialize.toast('Published: '+ data.result.Name +' '+ copybtn, 5000, 'green white-text');
				
				publishbtn.removeAttribute('disabled');
				publishbtn.innerHTML = publishtext;
				publishbtn.parentNode.className = '';
			});
        };

        $scope.resolve = function(name) {
			$scope.apiMiddleware.resolve(name).then(function(data) {
//				console.log('resolved', name, 'path', data);
				$scope.fileNavigator.refresh();
			});
		};	
		
        $scope.keyValue = function(key) {
			$scope.apiMiddleware.keyValue(key).then(function(data) {
//				console.log('key', key, 'value', data);
			});
		};			
		
        $scope.changePermissions = function() {
            $scope.apiMiddleware.changePermissions($scope.temps, $scope.temp).then(function() {
                $scope.modal('changepermissions', true);
            });
        };

        $scope.download = function() {
            var item = $scope.singleSelection();
            if ($scope.selectionHas('dir')) {
                return;
            }
            if (item) {
                return $scope.apiMiddleware.download(item);
            }
            return $scope.apiMiddleware.downloadMultiple($scope.temps);
        };

        $scope.copy = function() {
            var item = $scope.singleSelection();
            if (item) {
                var name = item.tempModel.name.trim();
                var nameExists = $scope.fileNavigator.fileNameExists(name);
                if (nameExists && validateSamePath(item)) {
                    $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                    return false;
                }
                if (!name) {
                    $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                    return false;
                }
            }
            $scope.apiMiddleware.copy($scope.temps, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('copy', true);
            });
        };

        $scope.compress = function() {
            var name = $scope.temp.tempModel.name.trim();
            var nameExists = $scope.fileNavigator.fileNameExists(name);

            if (nameExists && validateSamePath($scope.temp)) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }
            if (!name) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }

            $scope.apiMiddleware.compress($scope.temps, name, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.compressAsync) {
                    return $scope.modal('compress', true);
                }
                $scope.apiMiddleware.apiHandler.asyncSuccess = true;
            }, function() {
                $scope.apiMiddleware.apiHandler.asyncSuccess = false;
            });
        };

        $scope.extract = function() {
            var item = $scope.temp;
            var name = $scope.temp.tempModel.name.trim();
            var nameExists = $scope.fileNavigator.fileNameExists(name);

            if (nameExists && validateSamePath($scope.temp)) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }
            if (!name) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }

            $scope.apiMiddleware.extract(item, name, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                if (! $scope.config.extractAsync) {
                    return $scope.modal('extract', true);
                }
                $scope.apiMiddleware.apiHandler.asyncSuccess = true;
            }, function() {
                $scope.apiMiddleware.apiHandler.asyncSuccess = false;
            });
        };

        $scope.remove = function() {
            $scope.apiMiddleware.remove($scope.temps).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('remove', true);
            });
        };

        $scope.move = function() {           
            var anyItem = $scope.singleSelection() || $scope.temps[0];
            if (anyItem && validateSamePath(anyItem)) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_cannot_move_same_path');
                return false;
            }
            $scope.apiMiddleware.move($scope.temps, $rootScope.selectedModalPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('move', true);
            });
        };

        $scope.rename = function() {
            var item = $scope.singleSelection();
            var name = item.tempModel.name;
            var samePath = item.tempModel.path.join('') === item.model.path.join('');
            if (!name || (samePath && $scope.fileNavigator.fileNameExists(name))) {
                $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
                return false;
            }
            $scope.apiMiddleware.rename(item).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('rename', true);
            });
        };

        $scope.createFolder = function() {
            var item = $scope.singleSelection();
            var name = item.tempModel.name;
            if (!name || $scope.fileNavigator.fileNameExists(name)) {
                return $scope.apiMiddleware.apiHandler.error = $translate.instant('error_invalid_filename');
            }
            $scope.apiMiddleware.createFolder(item).then(function() {
                $scope.fileNavigator.refresh();
                $scope.modal('newfolder', true);
            });
        };

        $scope.addForUpload = function($files) {
            $scope.uploadFileList = $scope.uploadFileList.concat($files);
            $scope.modal('uploadfile');
        };

        $scope.removeFromUpload = function(index) {
            $scope.uploadFileList.splice(index, 1);
        };

        $scope.uploadFiles = function() {
            $scope.apiMiddleware.upload($scope.uploadFileList, $scope.fileNavigator.currentPath).then(function() {
                $scope.fileNavigator.refresh();
                $scope.uploadFileList = [];
                $scope.modal('uploadfile', true);
            }, function(data) {
                var errorMsg = data.result && data.result.error || $translate.instant('error_uploading_files');
                $scope.apiMiddleware.apiHandler.error = errorMsg;
            });
        };

        var validateSamePath = function(item) {
            var selectedPath = $rootScope.selectedModalPath.join('');
            var selectedItemsPath = item && item.model.path.join('');
            return selectedItemsPath === selectedPath;
        };

        var getQueryParam = function(param) {
            var found = $window.location.search.substr(1).split('&').filter(function(item) {
                return param ===  item.split('=')[0];
            });
            return found[0] && found[0].split('=')[1] || undefined;
        };

        $scope.changeLanguage(getQueryParam('lang'));
        $scope.isWindows = getQueryParam('server') === 'Windows';		
		
		// Key, IPFS or IPNS?
		var ipfsActive = fileManagerConfig.rootPath ? true : false;
		if (ipfsActive) {
			if ($scope.config.resolvePath == 1) {
				$scope.resolve($scope.config.rootPath);
			} else if ($scope.config.resolvePath == 2) {
				$scope.resolve($scope.config.publicKey);
			} else {
				$scope.fileNavigator.refresh();
			}
		
			$scope.ipfsPeers = 0;	
			$http.get(fileManagerConfig.listUrl.substring(0, fileManagerConfig.listUrl.lastIndexOf('/'))+'/swarm/peers').then(function(res){
				if (res.status == 200) {
					$scope.ipfsPeers = res.data.Peers.length;
				}
			});	
		} 
    }]);
})(angular, jQuery);
