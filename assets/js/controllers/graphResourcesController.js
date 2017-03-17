angular.module('app')
  .controller('GraphResourcesController', ['$scope', 'GraphResources',
    function($scope, GraphResources) {
      $("#start").click(function(){
        $("#contain-graph").removeClass("disabled-page");
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
        if (response.length === 0) {
          var graph = new GraphResource();
          graph.$save().then(function(response) {
            console.log(graph);
            eventResources.graph = response;
            $scope.$broadcast('graphResources', eventResources);
          });
        } else {
          eventResources.graph = response[0];
          console.log('graph resp',response);
          $scope.$broadcast('graphResources', eventResources);
        }
      });
    }
  ]);
