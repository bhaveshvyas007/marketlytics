angular.module('app')
  .factory('TaskCallbacks', [
    function() {
      return {
        modelUpdateCallback: function(jointModel) {
          jointModel.attr('.icon.task', { display: 'block' });
          jointModel.attr('ellipse', { fill: 'lightblue' });
        }
      };
    }
  ]);
