angular.module('app')
  .controller('GraphResourcesController', ['$scope', 'GraphResources',
    function($scope, GraphResources) {
      function addDefault() {
        $scope.$emit('graphDropEvent', {
           dropPoint : {"x":35,"y":272},
           entityAttributes :{"name":"<name>","desc":"undefined","id":"undefined","entityIdentifier":"beneficiary"} 
        });
      };

      var prevent = false;
      $scope.$on('graphDropEvent', function (event, data) {
        prevent = true;
        setTimeout(function() {
          prevent = false;
        }, 500);
      });
      $scope.$on('graphSelection',function(event,data){
        if(prevent){
          return;
        }
        console.log("event",event);
        //create sub elements on this event
        var dynaX = 200,dynaY=170;
        var childType = "task";
        if(data.entityIdentifier == "beneficiary"){
          childType = "company";
          dynaX = 100;
          dynaY=220;
        }
        setTimeout(function () {
          prevent = true;
          $scope.$emit('graphDropEvent', {
           dropPoint : {"x":dynaX,"y":dynaY},
           entityAttributes :{"name":"<name>","desc":"undefined","id":"undefined","entityIdentifier":childType} 
          });
        },100);

        setTimeout(function() {
          prevent = false;
        }, 500);
      });
          
      var GraphResource = GraphResources.graph(),
          eventResources = {
            entities: {
              company: GraphResources.companies(),
              beneficiary: GraphResources.beneficiaries(),
              task:GraphResources.task()
            },
            entityRelations: GraphResources.relations()
          };

      GraphResource.query(function(response) {
        console.log("response",response);
        if (response.length === 0) {
          var graph = new GraphResource();
          graph.$save().then(function(response) {
            console.log(graph);
            eventResources.graph = response;
            $scope.$broadcast('graphResources', eventResources);
            if(true || response[0] && !response[0].content){
              setTimeout(function () {
                 addDefault();
              },3000);
            }
          });
        } else {
          if(!response[0].content){
            setTimeout(function () {
                addDefault();
            },2000);
          }
          refreshGraph(response[0]);
        }
      });

      $scope.$on('refreshGraph',function(event,g){
        refreshGraph(g);
        // GraphResource.query(function(response) {
        //   if (response.length === 0) {
        //     var graph = new GraphResource();
        //     graph.$save().then(function(response) {
        //       console.log(graph);
        //       eventResources.graph = response;
        //       $scope.$broadcast('graphResources', eventResources);
        //     });
        //   } else {
        //     refreshGraph(response[0]);
        //   }
        // });
      });
      
      function refreshGraph(g){
        eventResources.graph = g;
        console.log('graph resp',g);
        $scope.$broadcast('graphResources', eventResources);
      }
    }
  ]);
