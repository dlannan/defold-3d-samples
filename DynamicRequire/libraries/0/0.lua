-- Some lua test script

print("Testing this file..")

local blah = {}
blah.run = function( a )
	print( "TEST: "..a )
end

return blah