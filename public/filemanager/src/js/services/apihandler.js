(function(angular, $) {
    'use strict';
    angular.module('FileManagerApp').service('apiHandler', ['$http', '$q', '$window', '$translate', 'Upload', '$document', 'fileManagerConfig', '$timeout', 
        function ($http, $q, $window, $translate, Upload, $document, fileManagerConfig, $timeout) {

//		$http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

        var ApiHandler = function() {
            this.inprocess = false;
            this.asyncSuccess = false;
            this.error = '';
			this.status = false;
        };

        ApiHandler.prototype.deferredHandler = function(data, deferred, code, defaultMsg) {
            if (!data || typeof data !== 'object') {
                this.error = 'Error %s - Bridge response error, please check the API docs or this ajax response.'.replace('%s', code);
            }
            if (code == 404) {
                this.error = 'Error 404 - Backend bridge is not working, please check the ajax response.';
            }
            if (data.result && data.result.error) {
                this.error = data.result.error;
            }
            if (!this.error && data.error) {
                this.error = data.error.message;
            }
            if (!this.error && defaultMsg) {
                this.error = defaultMsg;
            }
            if (this.error) {
                return deferred.reject(data);
            }
            return deferred.resolve(data);
        };

        ApiHandler.prototype.list = function(apiUrl, path, customDeferredHandler) {
			var self = this;
            var dfHandler = customDeferredHandler || self.deferredHandler;
            var deferred = $q.defer();
            var data = {
                action: 'list',
                path: path
            };
						
			// Init root
			if (!fileManagerConfig.rootPath) {
				return;
			} else if (fileManagerConfig.rootPath != data.path && data.path === '/') {
				data.path = fileManagerConfig.rootPath;
			} else {
				data.path = fileManagerConfig.rootPath+data.path;
			}

            self.inprocess = true;
            self.error = '';
			
//			console.log('list: ', apiUrl, 'list: ', data.path);		
			$http.get(apiUrl+data.path).success(function(json, code) {
				var file,
					json = typeof response === 'string' ?  JSON.parse(json) : json,
					dummy = {
						"time":"00:00", 
						"day":"1", 
						"month":"Jan", 
						"size":"0",
						"group":"",
						"user":"ralfs@shiftnrg.org",
						"number":"2",
						"rights":"drwxr-xr-x",
						"type":"dir",
						"name":"test",
						"date":"2017-01-01 15:11:59",
						"hash":""
					},
					result = [];

				if (typeof json.Objects !== 'undefined') {										
					for (var i=0;i<json.Objects[0].Links.length;i++) {
						file = angular.copy(dummy);
						file.type = json.Objects[0].Links[i].Type == 2 ? 'file' : 'dir';
						file.name = json.Objects[0].Links[i].Name;
						file.size = json.Objects[0].Links[i].Size;
						file.rights = '-rw-r--r--';
						file.hash = json.Objects[0].Links[i].Hash;
						result.push(file);
					}
					
					data = {"result": result};
				} else {
					data = json;
				}
				dfHandler(data, deferred, code);
            }).error(function(data, code) {
                dfHandler(data, deferred, code, 'Unknown error listing, check the response');
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.copy = function(apiUrl, items, path, singleFilename) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'copy',
                items: items,
                newPath: path
            };

            if (singleFilename && items.length === 1) {
//				data.singleFilename = singleFilename;
            }
            
            self.inprocess = true;
            self.error = '';

			// Chain promises
			var queue = $q.all(null);
			
			angular.forEach(items, function(item){
				var name = item.path.substring(item.path.lastIndexOf('/')+1);
				queue = queue.then(function(){
					return $http({
						method: 'GET', 
						url: apiUrl + fileManagerConfig.rootPath + '&arg=' + [path, name].join('/').replace(/^\/+/g, '') + '&arg=' + item.hash
					}).error(function(data, code) {
						self.deferredHandler(data, deferred, code, $translate.instant('error_deleting'));				
					}).then(function(res){
						fileManagerConfig.rootPath = res.data.Hash;
					});	
				});	
			});
			
			// All of the HTTP requests are done
			queue.finally(function(){
				self.inprocess = false;
				self.deferredHandler({"result": true}, deferred, 200);
			});

			return deferred.promise;
        };

        ApiHandler.prototype.move = function(apiUrl, items, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'move',
                items: items,
                newPath: path
            };
            self.inprocess = true;
            self.error = '';
			
			// Chain promises
			var queue = $q.all(null);
			
			angular.forEach(items, function(item){
				// 1. copy with a different path and same filename
				var name = item.path.substring(item.path.lastIndexOf('/')+1);
				queue = queue.then(function(){
					return $http.get(fileManagerConfig.copyUrl + fileManagerConfig.rootPath + '&arg=' + [path, name].join('/').replace(/^\/+/g, '') + '&arg=' + item.hash).then(function(res){
						fileManagerConfig.rootPath = res.data.Hash;
					});
				});
				// 2. remove
				queue = queue.then(function(){
					return $http({
						method: 'GET', 
						url: fileManagerConfig.removeUrl + fileManagerConfig.rootPath + '&arg=' + item.path.replace(/^\/|\/$/g, '') + '&arg=' + item.hash
					}).error(function(data, code) {
						self.deferredHandler(data, deferred, code, $translate.instant('error_deleting'));				
					}).then(function(res){
						fileManagerConfig.rootPath = res.data.Hash;
					});	
				});	
			});
			
			// All of the HTTP requests are done
			queue.finally(function(){
				self.inprocess = false;
				self.deferredHandler({"result": true}, deferred, 200);
			});				
			
            return deferred.promise;
        };

        ApiHandler.prototype.remove = function(apiUrl, items) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'remove',
                items: items
            };

            self.inprocess = true;
            self.error = '';
			
			// Chain promises
			var queue = $q.all(null);
			
			angular.forEach(items, function(item){
				queue = queue.then(function(){
					return $http({
						method: 'GET', 
						url: apiUrl + fileManagerConfig.rootPath + '&arg=' + item.path.replace(/^\/|\/$/g, '') 
					}).error(function(data, code) {
						self.deferredHandler(data, deferred, code, $translate.instant('error_deleting'));				
					}).then(function(res){
						fileManagerConfig.rootPath = res.data.Hash;
					});
				});
			});
			
			// All of the HTTP requests are done
			queue.finally(function(){
				self.inprocess = false;
				self.deferredHandler({"result": true}, deferred, 200);
			});	
			
            return deferred.promise;
        };

        ApiHandler.prototype.upload = function(apiUrl, destination, files) {
            var self = this;
            var deferred = $q.defer();
			var data = {
//				destination: destination
			};	

            self.inprocess = true;
            self.progress = 0;
            self.error = '';
			
			// Chain promises
			var queue = $q.all(null);
			
			// Create directories first
			angular.forEach(files, function(file, key){
				if (file.type === 'directory' || (file.size === 0 && file.type === '')) {
					queue = queue.then(function(){
						return $http.get(fileManagerConfig.createFolderUrl + fileManagerConfig.rootPath + '&arg=' + [destination, file.name].join('/').replace(/^\/+/g, '') + '&arg=QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn').success(function(data, code) {
							fileManagerConfig.rootPath = data.Hash;
//							console.log('created dir:', file.name, ', merkle:', fileManagerConfig.rootPath);
							angular.element('#file-'+key).remove();
						});
					});
				} 
			});	
		
			// Upload the files
			angular.forEach(files, function(file, key){
				if (file.type === 'directory' || (file.size === 0 && file.type === '')) return;
				
				queue = queue.then(function(){
					file.upload = Upload.upload({
						url: apiUrl + fileManagerConfig.rootPath, 
						data: {file: Upload.rename(file, file.name)} 
					});
					
					return file.upload.then(function(data) {
						return $http.get(fileManagerConfig.copyUrl + fileManagerConfig.rootPath + '&arg=' + [destination, data.config.data.file.path || data.data.Name].join('/').replace(/\/+/g, '/').replace(/^\//g, '') + '&arg=' + data.data.Hash).success(function(json, code) {
							fileManagerConfig.rootPath = json.Hash; // Important!
//							console.log('upload file:', file.name, ', merkle:', fileManagerConfig.rootPath);
							angular.element('#file-'+key).remove();
						});
					}, function(response) {
						self.deferredHandler(data.data, deferred, data.status, 'Error uploading files. '+response.data);					
					}, function (evt) {
						self.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total)) - 1;
//						console.log('in process:', self.inprocess, 'progress:', self.progress);
					});
				});
			});

			// All of the HTTP requests are done
			queue.finally(function(){
				self.deferredHandler({"result": true}, deferred, 200);
				self.inprocess = false;
			});	
			
            return deferred.promise;
        };

        ApiHandler.prototype.getContent = function(apiUrl, itemPath) {      
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'getContent',
                item: itemPath
            };

            self.inprocess = true;
            self.error = '';

			$http({
			  url: apiUrl + fileManagerConfig.rootPath + itemPath,
			  method: 'GET',
			  transformResponse: function(value) {
				return value; // Return json content
			  }
			}).success(function(data, code) {
				data = {"result": data};
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_getting_content'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };
		
        ApiHandler.prototype.edit = function(apiUrl, itemPath, content) {
            var self = this;
            var deferred = $q.defer();
            var data = { /*
                action: 'edit',
                item: itemPath,
                content: content */
            };

            self.inprocess = true;
            self.progress = 0;
            self.error = '';

			// Construct a file
			var name = itemPath.substring(itemPath.lastIndexOf('/')+1);
			var file = new File([content], name, {
				type: "text/plain"
			});
			data['file-0'] = file;
			
			Upload.upload({
				url: apiUrl + fileManagerConfig.rootPath, 
				data: data
			}).then(function (data) {		
				// 1. remove old link
				$http.get(fileManagerConfig.removeUrl + fileManagerConfig.rootPath + '&arg=' + itemPath.replace(/^\//g, '')).success(function(json, code) {				
					// 2. add new link
					$http.get(fileManagerConfig.copyUrl + json.Hash + '&arg=' + itemPath.replace(/^\//g, '') + '&arg=' + data.data.Hash).success(function(json, code) {				
						fileManagerConfig.rootPath = json.Hash; // Important! 
						self.deferredHandler(data.data, deferred, data.status);
					});
				});
			}, function (data) {
				self.deferredHandler(data.data, deferred, data.status, 'Unknown error uploading files');
			}, function (evt) {
				self.progress = Math.min(100, parseInt(100.0 * evt.loaded / evt.total)) - 1;
			})['finally'](function() {
				self.inprocess = false;
				self.progress = 0;
			});
			
			return deferred.promise;
        };

        ApiHandler.prototype.rename = function(apiUrl, itemPath, newPath) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'rename',
                item: itemPath,
                newItemPath: newPath
            };
            self.inprocess = true;
            self.error = '';
			
			// 1. remove old link
			$http.get(fileManagerConfig.removeUrl + fileManagerConfig.rootPath + '&arg=' + itemPath[0].path.replace(/^\//g, '')).success(function(data, code) {				
				// 2. copy with same path and a different filename
				$http.get(fileManagerConfig.copyUrl + data.Hash + '&arg=' + newPath.replace(/^\//g, '') + '&arg=' + itemPath[0].hash).success(function(json, code) {				
					fileManagerConfig.rootPath = json.Hash; // Important! 
					data = {"result":data};
					self.deferredHandler(data, deferred, code);		
				}).error(function(data, code) {
					self.deferredHandler(data, deferred, code, $translate.instant('error_moving'));
				})['finally'](function() {
					self.inprocess = false;
				});
			});

            return deferred.promise;
        };

        ApiHandler.prototype.getUrl = function(apiUrl, path) {
			var data = {
                action: 'download',
                path: path
            };

//			return path && [apiUrl, $.param(data)].join('?');
			return path && apiUrl + fileManagerConfig.rootPath + path;
        };

        ApiHandler.prototype.pin = function(apiUrl) {
            var self = this;
			var data = {
                action: 'pin'
			};

            var deferred = $q.defer();
            self.inprocess = true;
			self.status = {title: 'Pinning', text: 'please wait.. '};
			
			return $http.post(apiUrl + fileManagerConfig.rootPath).success(function() {
				console.log('Data succcesfully pinned: '+fileManagerConfig.rootPath);
				if (self.status) self.status.text = 'Data succcesfully pinned: '+fileManagerConfig.rootPath;
				fileManagerConfig.pinHash = fileManagerConfig.rootPath;
				deferred.resolve({});
			}).catch(function(data, code) {
				if (self.status) self.status.text = 'Error while pinning';
				self.deferredHandler(data, deferred, code, $translate.instant('error_pinning'));
			}).finally(function() {				
				self.inprocess = false;
				$timeout(function() {
					self.status = false;
				}, 9000);				
			});
			
			return deferred.promise;
		};
		
        ApiHandler.prototype.publish = function(apiUrl) {
            var self = this;
			var data = {
                action: 'publish'
			};

            var deferred = $q.defer();
            self.inprocess = true;
			self.status = {title: 'Publishing', text: 'please wait.. '};
			
			self.keyValue(fileManagerConfig.keyValueUrl, fileManagerConfig.publicKey).then(function(key){
				if (key) {
//					console.log('key already exists:', key);
					self.status.text+= 'private key found (1/2)';
				}
			}).catch(function() {
				return $http.get(fileManagerConfig.keyGenUrl + fileManagerConfig.publicKey).success(function(data) {
//					console.log('key generated: ', data.Id, data.Name);
					self.status.text+= 'private key generated (1/2)';
				});
			}).finally(function() {
//				console.log('ready to publish');			
				$http.get(apiUrl + fileManagerConfig.rootPath + '&key=' + fileManagerConfig.publicKey).success(function(data) {
					console.log('Data succcesfully published', data.Name);
					if (self.status && data.Name) self.status.text = 'Data succcesfully published: '+ data.Name + ' (2/2)';
					fileManagerConfig.publishHash = data.Name;
					data = {"result": data};
					deferred.resolve(data);
				}).error(function(data, code) {
					if (self.status) self.status.text = 'Error while publishing';
					self.deferredHandler(data, deferred, code, $translate.instant('error_publishing'));
				})['finally'](function() {
					$timeout(function() {
						self.status = false;
					}, 9000);
					self.inprocess = false;
				});
			});

			return deferred.promise;
        };	

        ApiHandler.prototype.resolve = function(apiUrl, name) {
            var self = this;
			var data = {
                action: 'resolve'
			};

            var path = false;
			var key = false;
			var deferred = $q.defer();
            
			self.inprocess = true;
			self.status = {title: 'Resolving', text: 'please wait.. '};

			var resolveName = function(name) {				
//				console.log('try to resolve name: ', name);

				return $http.get(apiUrl + name).success(function(data) {
					if (self.status) self.status.text = 'data successfully resolved';
					path = data.Path.substring(data.Path.lastIndexOf('/')+1);
					fileManagerConfig.rootPath = path;
				}).error(function(data, code) {
					if (self.status && data && data.Message) self.status.text = data.Message;
					self.deferredHandler(data, deferred, code, $translate.instant('error_resolving'));
				})['finally'](function() {
					$timeout(function() {
						self.status = false;
					}, 3000);
					deferred.resolve(path);
					self.inprocess = false;	
				});	
			}
			
			if (!name) {
				self.inprocess = false;	
				self.status = false;
			} else if (name.length == 64) {
//				console.log('try to resolve key: ', name);
				self.keyValue(fileManagerConfig.keyValueUrl, name).then(function(result){
					key = result;
					if (key) {
						name = key;
						fileManagerConfig.publishHash = name;
					}
				}).finally(function() {
					if (!key && fileManagerConfig.resolvePath != 1) {
						self.status = false;	
						return deferred.reject();
					}
					resolveName(name);
				});
			} else {
				resolveName(name);
			} 
			
            return deferred.promise;
        };		

        ApiHandler.prototype.keyValue = function(apiUrl, key) {
            var self = this;
			var data = {
                action: 'keylist'
			};

			var name = false;
            var deferred = $q.defer();
            self.inprocess = true;

            $http.get(apiUrl).success(function(data) {
				angular.forEach(data.Keys, function(val) {
					if (val.Name == key) {
						name = val.Id;
					}
				});	
				if (!name) return deferred.reject();
//				console.log('found key = ', name);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_keylookup'));
            })['finally'](function() {
                deferred.resolve(name);
                self.inprocess = false;
            });
            return deferred.promise;
        };			

        ApiHandler.prototype.download = function(apiUrl, itemPath, toFilename, downloadByAjax, forceNewWindow) {
            var self = this;
            var url = this.getUrl(apiUrl, itemPath);

            if (!downloadByAjax || forceNewWindow || !$window.FS.saveAs) {
                !$window.FS.saveAs && $window.console.log('Your browser dont support ajax download, downloading '+url+' by default');
				
				return !!$window.open(url, '_blank', '');
            }
            
            var deferred = $q.defer();
            self.inprocess = true;

//			delete $http.defaults.headers.common['X-Requested-With']; 
            $http.get(url, {responseType: "arraybuffer"}).success(function(data) {
                var bin = new $window.Blob([data]);
                deferred.resolve(data);
                $window.FS.saveAs(bin, toFilename);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_downloading'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.downloadMultiple = function(apiUrl, items, toFilename, downloadByAjax, forceNewWindow) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'downloadMultiple',
                items: items,
                toFilename: toFilename
            };
            var url = [apiUrl, $.param(data)].join('?');

            if (!downloadByAjax || forceNewWindow || !$window.saveAs) {
                !$window.saveAs && $window.console.log('Your browser dont support ajax download, downloading by default');
                return !!$window.open(url, '_blank', '');
            }
            
            self.inprocess = true;
            $http.get(apiUrl).success(function(data) {
                var bin = new $window.Blob([data]);
                deferred.resolve(data);
                $window.saveAs(bin, toFilename);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_downloading'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.compress = function(apiUrl, items, compressedFilename, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'compress',
                items: items,
                destination: path,
                compressedFilename: compressedFilename
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_compressing'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.extract = function(apiUrl, item, folderName, path) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'extract',
                item: item,
                destination: path,
                folderName: folderName
            };

            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_extracting'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.changePermissions = function(apiUrl, items, permsOctal, permsCode, recursive) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'changePermissions',
                items: items,
                perms: permsOctal,
                permsCode: permsCode,
                recursive: !!recursive
            };
            
            self.inprocess = true;
            self.error = '';
            $http.post(apiUrl, data).success(function(data, code) {
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_changing_perms'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        ApiHandler.prototype.createFolder = function(apiUrl, path, content) {
            var self = this;
            var deferred = $q.defer();
            var data = {
                action: 'createFolder',
                path: path.replace(/^\/|\/$/g, ''),
				content: content
            };			
			var hash = data.content.indexOf('/')==-1 && data.content.substring(0,2) == 'Qm' && data.content.length == 46 ? content : 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn';			

			self.inprocess = true;
            self.error = '';

			$http.get(apiUrl + fileManagerConfig.rootPath + '&arg=' + data.path + '&arg='+hash).success(function(data, code) {
				fileManagerConfig.rootPath = data.Hash; // Important! Once we change the content we get an updated merkle hash
				data = {"result": data};
                self.deferredHandler(data, deferred, code);
            }).error(function(data, code) {
                self.deferredHandler(data, deferred, code, $translate.instant('error_creating_folder'));
            })['finally'](function() {
                self.inprocess = false;
            });
        
            return deferred.promise;
        };

        return ApiHandler;

    }]);
})(angular, jQuery);