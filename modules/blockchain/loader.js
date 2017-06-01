var async = require("async");

var private = {}, self = null,
	library = null, modules = null;

function Loader(cb, _library) {
	self = this;
	library = _library;
	cb(null, self);
}

private.loadBlockChain = function () {
	var offset = 0, limit = 100;

	modules.blockchain.blocks.count(function (err, count) {
		if (err) {
			return library.logger.warn("Failed to get blocks count", err)
		}

		library.logger.warn("Blocks " + count);
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.warn("Current " + offset);
				modules.blockchain.blocks.loadBlocksOffset(limit, offset, function (err) {
					if (err) {
						return setImmediate(cb, err);
					}

					offset = offset + limit;

					setImmediate(cb);
				});
			}, function (err) {
				if (err) {
					library.logger.warn("loadBlocksOffset", err);
					if (err.block) {
						library.logger.warn("Blockchain failed at ", err.block.height)
						modules.blockchain.blocks.simpleDeleteAfterBlock(err.block.height, function (err) {
							library.logger.warn("Blockchain clipped");
							library.bus.message("blockchainLoaded");
						})
					}
				} else {
					library.logger.warn("Blockchain loaded");
					library.bus.message("blockchainLoaded");
				}
			}
		)
	});
}

Loader.prototype.onBind = function (_modules) {
	modules = _modules;
}

Loader.prototype.onBlockchainReady = function () {
	private.loadBlockChain();
}

Loader.prototype.onMessage = function (msg) {
}

module.exports = Loader;
