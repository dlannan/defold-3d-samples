# Default Game with Dynamic Require example

The dynamic require uses dofile. This is a little nasty because of:
- Fixed pathing. Should support / and \ depending on platform 
- Wont support module reloads. Need to have a little global cache to make sure they are not blown away.
- No lua search paths are used. This could be added easily though.

