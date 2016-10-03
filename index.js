var
  argv        = require('yargs')                //Makes dealing with command line arguments reasonable
      .demand('connection')                     //Requires "--connection" to run (the path to a json file)
      .argv,                                    //Return the arguments

  bodyParser  = require('body-parser'),         //needed to parse the http body
  express     = require('express'),             //HTTP server for node
  redis       = require('redis'),               //Redis library
  rk          = require('rk'),                  //Joins arguments into redis ":" convention
  connectionJson
              = require(argv.connection),       //Require the JSON with all the connection info
  client      = redis.createClient(             //Client instance of Redis
    connectionJson
  ),
  keyRoot     = 'playground',                   //All of our keys start with "playground"
  keys        = {                               
    hll       : rk(keyRoot,'hll'),              //playground:hll
    set       : rk(keyRoot,'set'),              //playrgroun:set
    setByteSize
              : rk(keyRoot,'set-byte-size')     //playground:set-byte-size
  },
  app;

app = express();                                //init express

function sendInfo(res,next) {                   //Close over `res`[ponse] and `next` from Express routes
  return function(err,infoObj) {                //handle the redis response 
    if (err) { next(err); } else {              //pass any errors back to `next` to trigger a HTTP error message
      res.send(infoObj);                        //send the infoObj as a HTTP response
    }
  };
}

function storageInfo(incrby,cb) {               //`incrby` can either be the number of bytes of the sent item or null, `cb` is the callback
  var
    infoMulti = client.multi();                 //Start the multi queue. Will not run any of the chained commands until `exec`

  infoMulti
    .pfcount(keys.hll)                          //Get the number of unique items in the HyperLogLog
    .strlen(keys.hll)                           //Get the length of the HyperLogLog string - normally it would be 12k, but Redis automatically run-length encodes it, so in practice it will be much smaller for many HLLs
    .scard(keys.set);                           //Get the number of unique items in the set

  if (incrby) {
    infoMulti.incrby(keys.setByteSize,incrby);  //If `incrby` was passed as an agrument, the run the Redis incrby command. Incrby returns the new value.
  } else {
    infoMulti.get(keys.setByteSize);            //Otherwise just return the value
  }

  infoMulti.exec(function(err,resp) {           //Run all the chained commands
    if (err) { cb(err); } else {                //Handle the errors back to the `cb` function
      cb(
        err,                                    //err will be `null` here
        {
          hllCount    : resp[0],                //The `resp` array elements correspond to the order in which the multi commands were chained.
          hllLength   : resp[1],
          setCount    : resp[2],
          setByteSize : resp[3] ? resp[3] : 0   //ternary here because if you've reset the data or this is your first time around playground:set-byte-size will return nothing instead of 0
        }
      );
    }
  });
}

app.post(                                       
  '/item',                                      //A HTTP POST at the url /item
  bodyParser.json(),                            //Pass it throught the bodyParser middleware. We're using json here as that's how Angular natively sends data
  function(req,res,next) {
    var
      addMulti = client.multi();                //Start a multi queue

    addMulti
      .sadd(keys.set,req.body.value)            //Add the `value` from the posted JSON to the set
      .pfadd(keys.hll,req.body.value)           //Add the `value` from the posted JSON to the HyperLogLog
      .exec(function(err,resp) {                //Run the queue
        if (err) { next(err); } else {          //Handle and errors and send them back to client through HTTP
          storageInfo(                          //If the SADD command returns a 1 (e.g. something was added to the set) then pass the length of the `value` into the incrby argument of `storageInfo`, otherwise pass `null`
            resp[0] === 1 ? req.body.value.length : null, 
            sendInfo(res,next)                  //Use the closure to create a response with the correct `res` and `next`
          );
        }
      });
  }
);

app.get(
  '/items',                                     //A HTTP GET request to '/items'
  function(req,res,next) {
    storageInfo(                                //Get the info about the current state of the HLL and set
      null,                                     //nothing here (incrby argument) - we just want info
      sendInfo(res,next)                        //Use the closure to create a response with the correct `res` and `next`
    );
  }
);

app.delete(                                     
  '/items',                                     //A HTTP DELETE request to `/items` - we'll reset the HLL and the set, then return the info
  function(req,res,next) {    
    client.del(                                 //Delete a few keys - we can pass multiple keys into the DEL redis command
      keys.hll,                                 //kill the HLL
      keys.set,                                 //kill the set
      keys.setByteSize,                         //kill the byte size running total
      function(err) {
        if (err) { next(err); } else {          //Any errors are sent back through HTTP for debugging
          storageInfo(null,sendInfo(res,next)); //If no errors, then send the storage info
        }
      }
    );
  }
);

app
  .use(express.static('public'))                //Serve any static files in the 'public' directory
  .listen(8012, function() {                    //Make the express web server listen at port 8012
    console.log('server ready');                //Let the console know we're open for business.
  });