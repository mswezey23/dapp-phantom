module.exports = {
	fixedPoint : Math.pow(10, 8),
	fee : 0.1,
	defToken : "SHIFT",
	addrSuffix : "S",
	addrRegExp : "^[0-9]{1,21}[S|s]$",
	blockTime : 27000,

	// return  an object with the defToken property:
	defTokenObj : function (value) { return { "SHIFT" : value }; }
}
