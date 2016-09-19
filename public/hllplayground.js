angular
  .module(
    'hllPlayground',                                        //create and name the module
    ['chart.js']                                            //inject the angular-chart / chart.js directive 
  )
  .controller('PlaygroundCtrl', function($scope,$http) {    //define the name of our control and assing it a function
    var
      updateInfo,                                           //We'll store functions in `updateInfo`
      addHistory,                                           //and `addHistory`
      runningCount = 0;                                     //initialize our running count for use for the session-based charts
    
    updateInfo = function(response) {                       //`updateInfo` updates the charts, history and table after an update and HTTP response
      var
        chartHistory = -10;                                 //We'll keep 10 steps back in history

      angular.extend($scope,response.data);                 //This moves the AJAX response (`response.data`) into our scope. 
                                                            //Normally, you might not want to do this, especially if you don't have full control over the server side.
                                                            //It's fine for our little playground

      //The line chart get's it's data from `$scope.countHistory`. Each series is represted by an array and which is contained, itself in an array
      //The data ends up looking like [[1,2,3,4,5], [1,2,3,4,5]]
      $scope.countHistory[0].push(                         //0th position is HyperLogLog
        Number($scope.hllLength)                           //Numberify for good measure
      );
      $scope.countHistory[0] = $scope.countHistory[0]
        .slice(chartHistory);                              //Slice-ing the array to always get the last 10 items in the array for readability
      $scope.countHistory[1].push(                         //1st position is Set
        Number($scope.setByteSize)                         
      );
      $scope.countHistory[1] = $scope.countHistory[1]
        .slice(chartHistory);                              //Slice-ing the array to keep it in coordination with the HLL data

      runningCount += 1;                                  //Increment the runningCount
      $scope.countLabels.push(runningCount);              //This is just the x-axis lables
      $scope.countLabels = $scope.countLabels.slice(      //again with the slice so we only have 10 columns of data
        chartHistory
      );

      //`chartData` is the bar chart. The data layout is quite a bit simpler as we don't need to represent a history
      $scope.chartData = [
        [$scope.hllCount, $scope.hllLength],              //0th position is the HyperLogLog
        [$scope.setCount, $scope.setByteSize]             //1st position is the set information
      ];
    };

    addHistory = function(action) {                       //Adds to the history box below the text box
      $scope.history.push({                               
        action    : action,                               //`action` would be 'Added' or 'Reset All Data' -  really just the message you display first.
        subject   : $scope.aString                        //The `subject` is the subject of the action - ususally just the text input 
      });
      $scope.history = $scope.history.slice(-4);          //We only want to have 4 lines of history
    };

    $scope.send = function() {                            //Send the data to our server
      $http.post('/item',{                                //HTTP POST with a body
        value     : $scope.aString                        //The post body looks like the object in JSON form
      }).then(updateInfo);                                //Use a promise and `updateInfo` to handle the response and update the UI
      addHistory('Added',$scope.aString);                 //Add an entry to the history
      $scope.aString = undefined;                         //reset the text box
    };

    $scope.reset = function() {                           //Zero out the data in the server
      addHistory('Reset Data.');                          //Add an entry to the history
      $http.delete('/items')                              //HTTP DELETE with no body
        .then(updateInfo);                                //Use a promise and `updateInfo` to handle the response and update the UI
    };

    $scope.random = function() {
      $scope.aString = String(Math.random());             //Throw a random number into the model at `aString`
      $scope.send();                                      //Immediately send it - same as clicking the button on the UI
    };

    $scope.series = ['HyperLogLog', 'Redis Set'];         //Labels for when you hover over the bar chart 
    $scope.labels = ['Count','Data Length'];              //Y-Axis labels

    $scope.countHistory = [[],[]];                        //Zero out the line chart data
    $scope.countLabels = [];                              //Start out with a 
    $scope.countOptions = { animation : false };          //Setting the chart.js options for the line chart. I've turned off the animation because I found it distracting. Personal preference.
    $scope.countSeries = [                                //Labels for when you hover over the line chart
      'Size of HyperLogLog Key',
      'Number of characters in all set members'
    ];
    $scope.history = [];                                  //Zero out the history so we can push to it later

    $http.get('/items').then(updateInfo);                 //Run the initial request
  });