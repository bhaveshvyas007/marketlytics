'use strict';
angular.module('angular-jointjs-graph', ['ngResource', 'angular-jointjs-graph/templates']);

angular.module('angular-jointjs-graph/templates', [])
  .run(['$templateCache',
    function ($templateCache) {
      $templateCache.put('angular-joints-graph/templates/graph',
        '<div class="organogram">\n' +
        '<section class="chartContainer">\n' +
        '<div class="chartArea" droppable></div>\n' +
        '<div ng-transclude></div>\n' +
        '</section>\n' +
        '</div>'
      );

      $templateCache.put('angular-joints-graph/templates/graphSidePanelTools',
        '<div class="graph-tools">\n' +
        '<div class="basic">\n' +
        '<div class="intro hide">Drag to create new</div>\n' +
        '<div class="fabric"></div>\n' +
        '</div>\n' +
        '</div>'
      );

      $templateCache.put('angular-joints-graph/templates/graphSidePanelDetails',
        '<div ng-transclude></div>'
      );

      $templateCache.put('angular-joints-graph/templates/graphNewEntity',
        '<div class="instance-template" draggable></div>'
      );

      $templateCache.put('angular-joints-graph/templates/graphExistingEntities',
        ''
      );
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('draggable', ['$window',
    function ($window) {
      return function (scope, element) {
        var el = element[0];
        el.draggable = true;

        el.addEventListener('dragstart', function (e) {
          e.dataTransfer.effectAllowed = 'copy';

          this.classList.add('drag');

          // We need to keep the pointer position relative to the element
          // being dragged in order to place it correctly on canvas.
          // The bounding rectangle takes page scroll position into account.
          var left = e.clientX - e.target.getBoundingClientRect().left,
            top = e.clientY - e.target.getBoundingClientRect().top,
            offsetPoint = $window.g.point(left, top);

          e.dataTransfer.setData('text', JSON.stringify({
            'entity-attributes': el.dataset,
            'pointer-offset': offsetPoint
          }));
        });

        el.addEventListener('dragend', function () {
          this.classList.remove('drag');
        });
      };
    }
  ]);
//dagPopover..
'use strict';
angular.module('angular-jointjs-graph').directive('customPopover', function () {
  return {
    restrict: 'A',
    template: '<span>{{label}}</span>',
    link: function (scope, el, attrs) {
      scope.label = attrs.popoverLabel;
      $(el).popover({
        trigger: 'click',
        html: true,
        content: attrs.popoverHtml,
        placement: attrs.popoverPlacement
      });
    }
  };
});
'use strict';
angular.module('angular-jointjs-graph')
  .directive('droppable', ['$window',
    function ($window) {
      return {
        link: function (scope, element) {
          var el = element[0];

          el.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          });

          el.addEventListener('drop', function (e) {
            e.stopPropagation();

            var dataTransfer = JSON.parse(e.dataTransfer.getData('text'));

            /*
             * This offset represents position of mouse pointer relative to the
             * element being dragged. We set its value when drag starts and keep
             * it in the event object. This offset is used to correctly position
             * newly created element – it should be right below the dragged element.
             */
            var pointerOffset = dataTransfer['pointer-offset'],
              elementOffset = element[0].getBoundingClientRect(),
              left = Math.floor(e.clientX - elementOffset.left - pointerOffset.x),
              top = Math.floor(e.clientY - elementOffset.top - pointerOffset.y),
              dropPoint = $window.g.point(left, top),
              entityAttributes = dataTransfer['entity-attributes'];
              console.log(left,top);
              console.log("dropPoint",JSON.stringify(dropPoint));
              console.log("entityAttributes",JSON.stringify(entityAttributes));
            scope.$emit('graphDropEvent', {
              entityAttributes: entityAttributes,
              dropPoint: dropPoint
            });
          });
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('graph', ['JointGraph', 'JointChartNode', 'JointElementView', 'JointNodeModel', 'JointPaper', '$q', 'GraphHelpers', 'GraphEntities', 'GraphLinks', 'GraphSelection', 'JointGraphResources', '$templateCache',
    function (JointGraph, JointChartNode, JointElementView, JointNodeModel, JointPaper, $q, GraphHelpers, GraphEntities, GraphLinks, GraphSelection, JointGraphResources, $templateCache) {
      return {
        restrict: 'E',
        templateUrl: 'angular-joints-graph/templates/graph',
        transclude: true,
        controller: ['$scope', '$element', '$attrs',
          function ($scope, $element) {

            $scope.$on('graphResources', function (event, data) {
              JointGraphResources.set(data);
              data.graph.$get().then(function (graph) {
                $scope.graph = graph;
                return Object.keys(data.entities).map(function (key) {
                  return {
                    key: key,
                    promise: GraphHelpers.queryResource(data.entities[key])
                  };
                }).reduce(function (prev, current) {
                  return prev.then(function (entitiesMap) {
                    return current.promise.then(function (array) {
                      entitiesMap[current.key] = array;
                      return entitiesMap;
                    });
                  });
                }, $q.when({}));
              }).then(function (entitiesMap) {
                GraphEntities.set(entitiesMap);
                $scope.$broadcast('graphEntitiesLoaded', entitiesMap);
                return GraphHelpers.queryResource(data.entityRelations);
              }).then(function (entityRelations) {
                GraphLinks.set(entityRelations);
                $scope.$broadcast('graphEntityRelationsLoaded', entityRelations);
              }).then(function () {
                $scope.$broadcast('graphResourcesLoaded');
                initGraph();
              }, function (error) {
                $scope.$emit('applicationError', {
                  errData: error
                });
              });
            });

            function initGraph() {
              JointElementView.init($element.find('.chartContainer'));
              JointPaper.init($element.find('.chartArea'));
              JointPaper.onSelectionChange(function (ids) {
                GraphSelection.select(ids);
                $scope.$digest();
              });
              JointPaper.onCellPositionChange(function () {
                $scope.saveGraph();
              });

              JointGraph.on('add', function (cell) {
                if (cell.get('isChartNode')) {
                  cell.on('createLinkStart', createLinkStart);
                  cell.on('createLinkEnd', createLinkEnd);
                  cell.on('nodeRemoved', nodeRemoved);
                } else {
                  cell.on('remove', linkRemoved);
                }
              });

              addGraphCells();
            }

            function addGraphCells() {
              var graphContent = $scope.graph.content ?
                JSON.parse($scope.graph.content) : {};

              if (graphContent.cells) {
                graphContent.cells.forEach(function (element) {
                  if (element.isChartNode) {
                    GraphEntities.markPresentOnGraph(element);
                  }
                });

                JointGraph.addCells(graphContent.cells);
              }
            }

            $scope.clearCellSelectionAndRevert = function () {
              GraphSelection.clearAndRevert();
            };

            $scope.revertSelection = function () {
              GraphSelection.revertSelection();
            };

            $scope.syncSelection = function () {
              GraphSelection.syncSelection();
            };

            $scope.selectEntity = function (entity, identifier) {
              GraphSelection.selectEntity(entity, identifier);
            };

            $scope.saveGraph = function () {
              setTimeout(function () {
                //console.log(JSON.stringify(JointGraph.toJSON()));
                $scope.graph.content = JSON.stringify(JointGraph.toJSON());
                $scope.graph.$update().catch(function (data) {
                  $scope.$emit('applicationError', {
                    errData: data
                  });
                });
              }, 0);
            };

            function createLinkStart() {
              $scope.$apply(function () {
                GraphSelection.clearAndRevert();
              });
            }

            function createLinkEnd(linkId) {
              var link = JointGraph.getCell(linkId);

              $scope.$apply(function () {
                link.createResource().then(function (linkEntity) {
                  GraphLinks.addSingle(linkEntity);
                  $scope.saveGraph();
                }, function (data) {
                  $scope.$emit('applicationError', {
                    errData: data
                  });
                  link.remove({
                    skipCallbacks: true
                  });
                });
              });
            }

            function nodeRemoved(event, model) {
              event.preventDefault();

              $scope.$apply(function () {
                var resource = GraphEntities.getSingle(model),
                  selectedResource = GraphSelection.getSelectedEntity();

                if (resource) {
                  if (resource === selectedResource) {
                    GraphSelection.clear();
                  }

                  GraphEntities.markRemovedFromGraph(model);
                  $scope.saveGraph();
                }
              });
            }

            $scope.$on('removeEntity', function (event, data) {
              event.stopPropagation();
              data.entity.$remove().then(function () {
                GraphEntities.remove(data.entity, data.identifier);
              }, function (errData) {
                $scope.$emit('applicationError', {
                  errData: errData
                });
              });
            });

            function linkRemoved(cell, models, options) {
              if (options && options.skipCallbacks) {
                //Link is removed because of invalid target
              } else {
                var linkResource = GraphLinks.getSingle(cell);

                if (linkResource) {
                  linkResource.$remove().then(function () {
                    GraphLinks.remove(cell);
                    if (options && options.skipGraphSave) {
                      //When removing a node, the nodeRemoved callback saves the graph
                    } else {
                      $scope.saveGraph();
                    }
                  }, function (errData) {
                    $scope.$emit('applicationError', {
                      errData: errData
                    });
                  });
                }
              }
            }

            function updateResourceList(cellModel) {
              var deferred = $q.defer(),
                modelId = cellModel.get('backendModelParams')[GraphHelpers.getModelIdKey()];

              if (modelId === 'undefined') {
                cellModel.createResource().then(function (resource) {
                  GraphEntities.addSingle(cellModel, resource);
                  deferred.resolve({
                    newNode: true
                  });
                }, function (errData) {
                  deferred.reject(errData);
                });
              } else {
                GraphEntities.markPresentOnGraph(cellModel);
                deferred.resolve({
                  newNode: false
                });
              }

              return deferred.promise;
            }

            function highlightCell(cellModel) {
              var cellView = JointPaper.getPaper().findViewByModel(cellModel);
              JointPaper.clearSelection();
              GraphSelection.select(JointPaper.selectCell(cellView));
            }

            GraphSelection.onSelectionChange(function (selection) {
              if(!selection){
                return
              }
              //console.log(selection);
              //$scope.dagPopover(selection.selectedCellId, selection.entityIdentifier);
              $scope.$broadcast('graphSelection', selection);
            });

            function updateProperties(id,prop) {
              // console.log('updated object',$scope.graph.content);return;
              // console.log('joint graph',$scope.graph.content);return;
              // var getJointGrapObject = JointGraph.toJSON();
              var parsed = JSON.parse($scope.graph.content);
              angular.forEach(parsed.cells,function(val){
                if(val.id == id){
                  val.backendModelParams.name = prop.name;
                  val.attrs[".name"].text = prop.name;
                }
              });
              $scope.graph.content = JSON.stringify(parsed);
              console.log($scope.graph.content);
              // $scope.saveGraph();
              $scope.graph.$update();
              //$scope.$broadcast('refreshGraph',$scope.graph);
            }

            $("#saveDageflow").click(function () {
              var getJointGrapObject = JSON.parse($scope.graph.content);
              console.log(getJointGrapObject);
              console.log(JSON.stringify(getJointGrapObject));
              var dag = {};
              var stages = {};
              var tasks = {};
              var links = {};

              angular.forEach(getJointGrapObject.cells, function (val) {
                if (val.type == 'html.Element' && val.backendModelParams.entityIdentifier == 'beneficiary') {
                  dag[val.id] ={
                    "dagId" : val.id,
                    "dependsOn" : [],
                    "stages" : [],
                    "properties":val.properties ? val.properties : {}
                  };
                }

                if (val.type == 'html.Element' && val.backendModelParams.entityIdentifier == 'company') {
                  stages[val.id] ={
                    "stageId" : val.id,
                    "dependsOn" : [],
                    "tasks" : [],
                    "properties":val.properties ? val.properties : {}
                  };
                }

                if (val.type == 'html.Element' && val.backendModelParams.entityIdentifier == 'task') {

                  tasks[val.id] = {
                    "taskId":val.id,
                    "dependsOn" : [],
                    "operators" : [ 
                      {
                          "dependsOn" : [],
                          "operatorInfo" : {
                              "ref" : {
                                  "type" : "load",
                                  "uuid" : "4324679b-45f8-469a-a255-e505b0935f4b",
                                  "version" : "1489302919"
                              }
                          },
                          "operatorParams" : {}
                      }
                    ],
                    "properties":val.properties ? val.properties : {}
                  };
                }

                if(val.type=='link'){
                  links[val.id] = val;
                }

              });

              angular.forEach(links,function (val) {
                if(tasks[val.target.id])
                  tasks[val.target.id].dependsOn.push(val.source.id);
                else if(stages[val.target.id])
                  stages[val.target.id].dependsOn.push(val.source.id);
                else if(dag[val.target.id])
                  dag[val.target.id].dependsOn.push(val.source.id);
                  
                if(stages[val.source.id] && tasks[val.target.id]){
                  stages[val.source.id].tasks.push(tasks[val.target.id]);
                }
                else if(dag[val.source.id] && stages[val.target.id]){
                  dag[val.source.id].stages.push(stages[val.target.id]);
                }
              });

              console.log('dag',dag);

              var inArrayFormat = [];
              angular.forEach(dag,function(val){
                inArrayFormat.push(val);
              });
              console.log("*******DAG JSON*******");
              inArrayFormat[0].stages = [ 
        {
            "stageId" : "0",
            "dependsOn" : [],
            "tasks" : [ 
                {
                    "taskId" : "0",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-account",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "ea2eb904-f4d1-4365-ab9e-a8b0825408de",
                                    "version" : "1490112991"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "1",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-account_status_type",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "80c39cc7-f2a8-40ee-953f-b6586da5783b",
                                    "version" : "1490113400"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "2",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-account_type",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "0c9c2d41-26cf-4e7f-a884-eeffee82814d",
                                    "version" : "1490113619"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "3",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-address",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "f1f7cee1-081e-44fa-8e44-fbb37c12ebdc",
                                    "version" : "1490113834"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "4",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-bank",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "be1ee064-1699-4ddc-bdf8-b1aa46a9bd7c",
                                    "version" : "1490114010"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "5",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-branch",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "c18b766e-77fe-4319-b6c5-8cb61bd56d18",
                                    "version" : "1490114224"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "6",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-branch_type",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "fc9bd7db-dad9-4bfd-8c8f-f178ecc6b261",
                                    "version" : "1490114336"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "7",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-customer",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "853c0149-f51a-413e-9e5f-a0dd6860a296",
                                    "version" : "1490115065"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "8",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-product type",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "6eb56e2c-03e3-4434-8557-29b7cbeeb6aa",
                                    "version" : "1490115238"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "9",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-transaction",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "72eeaf8e-da21-41dd-bb11-3381f15a526c",
                                    "version" : "1490115482"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "10",
                    "dependsOn" : [],
                    "name" : "DQ groups on source-transaction type",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "9028015c-049a-4845-8e0e-d245f5b6a1d0",
                                    "version" : "1490115619"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }
            ]
        }, 
        {
            "stageId" : "1",
            "dependsOn" : [],
            "tasks" : [ 
                {
                    "taskId" : "0",
                    "dependsOn" : [],
                    "name" : "Load Dimention_0",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "6356a9f8-f5c5-454b-9cbe-0d6ecc452b1a"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "1",
                    "dependsOn" : [],
                    "name" : "Load Dimention_1",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "d2cc6181-9104-4f2d-b220-2cd29a69dabe"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "2",
                    "dependsOn" : [],
                    "name" : "Load Dimention_2",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "f06e9f5d-3b8b-4daf-9900-a9b641cbb5db"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "3",
                    "dependsOn" : [],
                    "name" : "Load Dimention_3",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "ec398401-8495-419f-bde7-76db137f3088"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "4",
                    "dependsOn" : [],
                    "name" : "Load Dimention_4",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "bfef7565-e873-42ba-9e60-482751a24003"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "5",
                    "dependsOn" : [],
                    "name" : "Load Dimention_5",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "4f875b10-9534-4f9d-b9e5-b4cae8e7bf0d"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }
            ]
        }, 
        {
            "stageId" : "2",
            "dependsOn" : [],
            "tasks" : [ 
                {
                    "taskId" : "0",
                    "dependsOn" : [],
                    "name" : "Load Fact table",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "map",
                                    "uuid" : "850eec61-2047-4d94-aab1-6117d7f84bd6"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }
            ]
        }, 
        {
            "stageId" : "3",
            "dependsOn" : [],
            "tasks" : [ 
                {
                    "taskId" : "0",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-dim_account",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "05f1acf0-ad0b-4f21-954d-d8a380dc42c6",
                                    "version" : "1490116757"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "1",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-dim_address",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "a33f238a-f542-4f40-b2b8-d7c1290b1480",
                                    "version" : "1490117001"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "2",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-dim_bank",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "f2d79ecf-f357-444b-8e85-4221cd9ffe33",
                                    "version" : "1490117199"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "3",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-dim_branch",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "e3e5d90a-0d07-4894-98b0-dab7d5407fb5",
                                    "version" : "1490117473"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "4",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-dim_customer",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "38b50dc4-3f2b-48d3-b5ba-e1ea6718a692",
                                    "version" : "1490118940"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "5",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-dim_transaction_type",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "328e0a75-9614-4000-a2cd-2d23fceaa66c",
                                    "version" : "1490119254"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }, 
                {
                    "taskId" : "6",
                    "dependsOn" : [],
                    "name" : "DQ groups on target-fact_transaction",
                    "operators" : [ 
                        {
                            "operatorId" : "0",
                            "dependsOn" : [],
                            "operatorInfo" : {
                                "ref" : {
                                    "type" : "dqgroup",
                                    "uuid" : "9a13ee57-22f0-48d4-a0c6-914e1e39183b",
                                    "version" : "1490119549"
                                }
                            },
                            "filterInfo" : []
                        }
                    ]
                }
            ]
        }
    ];


              console.log(JSON.stringify(inArrayFormat));

              var joonaObj = [];
              angular.forEach(inArrayFormat,function(val){
                debugger;
                joonaObj.push(
                  {"type":"html.Element",
                  "position":{
                  "x":35,
                  "y":272
                  },
                  "size":{
                  "width":1,
                  "height":1
                  },
                  "angle":0,
                  "backendModelParams":{
                  "name":"<name>",
                  "desc":"undefined",
                  "id":val.dagId,
                  "entityIdentifier":"beneficiary",
                  "country":"<country>"
                  },
                  "options":{
                  "interactive":true
                  },
                  "isChartNode":true,
                  "id":"d776acb0-7fe8-4f67-86a2-aea954bb9d23",
                  "z":1,
                  "attrs":{
                  "ellipse":{
                  "fill":"lightblue"
                  },
                  ".icon.beneficiary":{
                  "display":"block",
                  "text":""
                  },
                  ".icon.company":{
                  "display":"none",
                  "text":""
                  },
                  ".icon.task":{
                  "display":"none",
                  "text":""
                  },
                  ".name":{
                  "text":"<name>",
                  "y":"19px",
                  "x-alignment":"left"
                  },
                  ".country":{
                  "text":"<country>",
                  "y":"31px",
                  "x-alignment":"left"
                  }
                  }
                });

                if(val.dependsOn.length > 0){
                  angular.forEach(val.dependsOn,function (dependancy) {
                    joonaObj.push(
                    {
                      "type":"link",
                      "source":{
                      "id":dependancy
                      },
                      "target":{
                      "id":val.dagId
                      },
                      "backendModelParams":{
                      "id":1
                      },
                      "isChartNode":false,
                      "id":val.dagId+"_"+dependancy,
                      "z":3,
                      "vertices":[
                      {
                      "x":592.5,
                      "y":220
                      }
                      ],
                      "attrs":{
                      ".marker-target":{
                      "d":"M 10 0 L 0 5 L 10 10 z"
                      },
                      ".marker-source":{
                      "display":"none"
                      },
                      ".marker-vertex-remove-area":{
                      "display":"none"
                      },
                      ".marker-vertex-remove":{
                      "display":"none"
                      },
                      ".marker-vertex":{
                      "r":"5"
                      }
                      }
                    }
                  )
                  });
                }

                if(val.stages.length > 0){
                  var stageYPos = 80;
                  var taskXPos = 300;
                  angular.forEach(val.stages,function (stage) {
                    stage.stageId = Math.round(Math.random()*1000000000).toString();
                    stageYPos = stageYPos + 100;
                    joonaObj.push(
                      {
                        "type":"html.Element",
                        "position":{
                        "x": 200,
                        "y": stageYPos
                        },
                        "size":{
                        "width":1,
                        "height":1
                        },
                        "angle":0,
                        "backendModelParams":{
                        "name":"<name>",
                        "desc":"undefined",
                        "id":1,
                        "entityIdentifier":"company",
                        "country":"<country>"
                        },
                        "options":{
                        "interactive":true
                        },
                        "isChartNode":true,
                        "id":stage.stageId,
                        "z":2,
                        "attrs":{
                          "ellipse":{
                          "fill":"lightcoral"
                          },
                          ".icon.beneficiary":{
                          "display":"none",
                          "text":""
                          },
                          ".icon.company":{
                          "display":"block",
                          "text":""
                          },
                          ".icon.task":{
                          "display":"none",
                          "text":""
                          },
                          ".name":{
                          "text":"<name>",
                          "y":"19px",
                          "x-alignment":"left"
                          },
                          ".country":{
                          "text":"<country>",
                          "y":"31px",
                          "x-alignment":"left"
                          }
                        }
                      }
                    )
                    if(stage.dependsOn.length > 0){
                      angular.forEach(stage.dependsOn,function (dependancy) {
                        joonaObj.push(
                        {
                          "type":"link",
                          "source":{
                          "id":dependancy
                          },
                          "target":{
                          "id":stage.stageId
                          },
                          "backendModelParams":{
                          "id":1
                          },
                          "isChartNode":false,
                          "id":stage.stageId+"_"+dependancy,
                          "z":3,
                          "vertices":[
                          {
                          "x":592.5,
                          "y":220
                          }
                          ],
                          "attrs":{
                            ".marker-target":{
                            "d":"M 10 0 L 0 5 L 10 10 z"
                            },
                            ".marker-source":{
                            "display":"none"
                            },
                            ".marker-vertex-remove-area":{
                            "display":"none"
                            },
                            ".marker-vertex-remove":{
                            "display":"none"
                            },
                            ".marker-vertex":{
                            "r":"5"
                            }
                            }
                          }
                        )
                      });
                    }

                    if(stage.tasks.length > 0){
                      taskXPos = taskXPos + 200
                      var taskYPos = 80;
                      angular.forEach(stage.tasks,function (task) {
                        task.taskId = Math.round(Math.random()*1000000000).toString();
                        taskYPos = taskYPos + 100
                        joonaObj.push(
                          {
                            "type":"html.Element",
                            "position":{
                            "x": taskXPos ,
                            "y": taskYPos
                            },
                            "size":{
                            "width":1,
                            "height":1
                            },
                            "angle":0,
                            "backendModelParams":{
                            "name": task.name || "<name>",
                            "desc":"undefined",
                            "id":1,
                            "entityIdentifier":"task",
                            "country":"<country>"
                            },
                            "options":{
                            "interactive":true
                            },
                            "isChartNode":true,
                            "id":task.taskId,
                            "z":2,
                            "attrs":{
                              "ellipse":{
                              "fill":"lightblue"
                              },
                              ".icon.beneficiary":{
                              "display":"none",
                              "text":""
                              },
                              ".icon.company":{
                              "display":"none",
                              "text":""
                              },
                              ".icon.task":{
                              "display":"block",
                              "text":""
                              },
                              ".name":{
                              "text":task.name || "<name>",
                              "y":"19px",
                              "x-alignment":"left"
                              },
                              ".country":{
                              "text":"<country>",
                              "y":"31px",
                              "x-alignment":"left"
                              }
                            }
                          }
                        )
                        if(task.dependsOn.length > 0){
                          angular.forEach(task.dependsOn,function (dependancy) {
                            joonaObj.push(
                            {
                              "type":"link",
                              "source":{
                              "id":dependancy
                              },
                              "target":{
                              "id":task.taskId
                              },
                              "backendModelParams":{
                              "id":1
                              },
                              "isChartNode":false,
                              "id":task.taskId+"_"+dependancy,
                              "z":3,
                              "vertices":[
                              {
                              "x":592.5,
                              "y":220
                              }
                              ],
                              "attrs":{
                                ".marker-target":{
                                "d":"M 10 0 L 0 5 L 10 10 z"
                                },
                                ".marker-source":{
                                "display":"none"
                                },
                                ".marker-vertex-remove-area":{
                                "display":"none"
                                },
                                ".marker-vertex-remove":{
                                "display":"none"
                                },
                                ".marker-vertex":{
                                "r":"5"
                                }
                                }
                              }
                            )
                          });
                        }
                      });
                    }
                  });
                }

              });
              console.log("*******Converted JSON*******");
              console.log(JSON.stringify(joonaObj));
              //console.log(JSON.stringify(JointGraph.toJSON()))
              $scope.graph.content=JSON.stringify({"cells":joonaObj});
              $scope.graph.$update();

              setTimeout(function() {
                location.reload();
              }, 1000);
            });
            $scope.dagPopover = function (id, entityIdentifier) {
              console.log(id, entityIdentifier);
              console.log(JointGraph.toJSON().cells[id]);
              $scope.id = id;
              var dagProperties = '';
              switch (entityIdentifier) {
                case 'beneficiary':
                  dagProperties = $templateCache.get('dagPopup');
                  break;
                case 'company':
                  dagProperties = $templateCache.get('stagePopup');
                  break;
                default:
                  dagProperties = $templateCache.get('taskPopup');
              }
              $("#dagProperties").html(dagProperties);
              $("#saveDageChanges").attr("data-id", id);
              $("#saveDageChanges").attr("data-entityIdentifier", entityIdentifier);
              $('#dagFlowEdit').modal('show');
               
               var name = $("g[model-id=" + id + "] .name tspan").html();
               var country = $("g[model-id=" + id + "] .country tspan").html();
               if(country.substr(0,1)=='&'){
                 country="";
               }
               if(name.substr(0,1)=='&'){
                 name="";
               }
               $('.modal-body #name').val(name);
               $('.modal-body #country').val(country);
                // var country = this.closest('.modal-body #pwd').val();
                //alert(id);
                
              //$scope.pushNewarrayElements(id);
              $("#saveDageChanges").click(function () {
                var id = this.getAttribute("data-id");
                var entityIdentifier = this.getAttribute("data-entityIdentifier");
                var prop = {};

                if(entityIdentifier == "company"){
                  prop.name = $('.modal-body #name').val();
                }
                else if (entityIdentifier == "task") {
                  prop = {
                    name : $('.modal-body #name').val()
                    // dropdown : $('.modal-body #dpdown').val()
                  }
                }
                else if(entityIdentifier == "beneficiary"){
                  prop = {}
                }
                
                var name = $('.modal-body #name').val();
                //var country = $('.modal-body #country').val();
                // var country = this.closest('.modal-body #pwd').val();
                //alert(id);

                updateProperties(id,prop);
                $("g[model-id=" + id + "] .name tspan").html(name);
                //$("g[model-id=" + id + "] .country tspan").html(country);
              })
            }

            $scope.pushNewarrayElements = function () {
              $scope.push('dependsOn', id)
            }
            $scope.$on('graphDropEvent', function (event, data) {
              event.stopPropagation();
              $scope.$apply(function () {
                var rect = JointChartNode.create(data.entityAttributes, data.dropPoint);
                JointGraph.addCell(rect);
                updateResourceList(rect).then(function (data) {
                    if (data.newNode) {
                      highlightCell(rect);
                    }

                    $scope.saveGraph();
                  },
                  function (data) {
                    $scope.$emit('applicationError', {
                      errData: data
                    });
                    rect.remove();
                  });
              });
            });
          }
        ]
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('graphExistingEntities', ['GraphEntities',
    function (GraphEntities) {
      return {
        require: '^graphSidePanelTools',
        restrict: 'E',
        templateUrl: 'angular-joints-graph/templates/graphExistingEntities',
        transclude: true,
        scope: true,
        controller: ['$scope', '$attrs', '$transclude',
          function ($scope, $attrs, $transclude) {
            $scope.transcludeEntities = $transclude;

            $scope.entityIdentifier = $attrs.entityIdentifier;

            $scope.$on('graphResourcesLoaded', function () {
              $scope.entities = GraphEntities.getForType($scope.entityIdentifier);
            });

            $scope.removeEntity = function (entity) {
              $scope.$emit('removeEntity', {
                entity: entity,
                identifier: $scope.entityIdentifier
              });
            };
          }
        ]
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('graphExistingEntity', ['GraphHelpers',
    function (GraphHelpers) {
      return {
        require: '^graphExistingEntities',
        restrict: 'A',
        link: function ($scope, $element, $attrs) {
          var entityIdentifier = $attrs.graphExistingEntity,
            modelProperties = GraphHelpers.entityProperties(entityIdentifier),
            liElement = $element[0];

          modelProperties.forEach(function (property) {
            liElement.dataset[property] = $scope.entity[property];

            $scope.$watch('entity.' + property, function (value) {
              liElement.dataset[property] = value;
            });
          });

          liElement.dataset.entityIdentifier = entityIdentifier;

          $scope.transcludeEntities($scope, function (clone) {
            $element.append(clone);
          });
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('graphNewEntity', ['GraphHelpers',
    function (GraphHelpers) {
      return {
        require: '^graphSidePanelTools',
        restrict: 'E',
        templateUrl: 'angular-joints-graph/templates/graphNewEntity',
        transclude: true,
        link: function ($scope, $element, $attrs, $controller, $transclude) {
          var element = $element.find('.instance-template'),
            entityIdentifier = $attrs.entityIdentifier,
            modelProperties = GraphHelpers.entityProperties(entityIdentifier);

          if (modelProperties) {
            modelProperties.forEach(function (property) {
              element[0].dataset[property] = undefined;
            });
          }

          element[0].dataset.entityIdentifier = entityIdentifier;

          $transclude($scope, function (clone) {
            element.append(clone);
          });
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('graphSidePanelDetails', [
    function () {
      return {
        require: '^graph',
        scope: true,
        restrict: 'E',
        templateUrl: 'angular-joints-graph/templates/graphSidePanelDetails',
        transclude: true
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .directive('graphSidePanelTools', [
    function () {
      return {
        require: '^graph',
        restrict: 'E',
        templateUrl: 'angular-joints-graph/templates/graphSidePanelTools',
        transclude: true,
        controller: ['$scope', function ($scope) {
          $scope.showExtended = false;

          $scope.toggleExtended = function () {
            $scope.showExtended = !$scope.showExtended;
          };
        }],
        compile: function () {
          return {
            post: function ($scope, $element, $attrs, $controller, $transclude) {
              $transclude($scope, function (clone) {
                $element.find('div.fabric').append(clone.siblings('graph-new-entity').addBack());
                $element.find('ul').append(clone.siblings('graph-existing-entities'));
              });
            }
          };
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .provider('FactoryMap', [
    function () {
      var factoriesMap = {};

      this.register = function (factoryName, alias) {
        factoriesMap[alias || factoryName] = factoryName;
      };

      this.$get = ['$injector',
        function ($injector) {
          return {
            get: function (nameOrAlias) {
              try {
                if (factoriesMap[nameOrAlias]) {
                  return $injector.get(factoriesMap[nameOrAlias], null);
                } else {
                  return null;
                }
              } catch (e) {
                return null;
              }
            }
          };
        }
      ];
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('GraphEntities', ['GraphHelpers',
    function (GraphHelpers) {
      var entities = {},
        entityToJointModelMap = {};

      function getIdentifiers(graphModel) {
        var backendModelParams = graphModel.backendModelParams || graphModel.get('backendModelParams'),
          typeIdentifier = backendModelParams.entityIdentifier,
          modelIdKey = GraphHelpers.getModelIdKey(),
          uniqueId = backendModelParams[modelIdKey];

        return {
          typeIdentifier: typeIdentifier,
          uniqueId: uniqueId,
          modelIdKey: modelIdKey
        };
      }

      function findEntity(identifiers) {
        return entities[identifiers.typeIdentifier].filter(function (entity) {
          return entity[identifiers.modelIdKey] === identifiers.uniqueId;
        })[0];
      }

      return {
        set: function (entitiesMap) {
          Object.keys(entitiesMap).forEach(function (identifier) {
            entities[identifier] = entitiesMap[identifier];
            entityToJointModelMap[identifier] = {};
          });
        },
        addSingle: function (graphElement, entity) {
          var ids = getIdentifiers(graphElement);

          entity.show = false;
          entityToJointModelMap[ids.typeIdentifier][ids.uniqueId] = graphElement.id;
          entities[ids.typeIdentifier].unshift(entity);
        },
        getSingle: function (graphElement) {
          return findEntity(getIdentifiers(graphElement));
        },
        getForType: function (identifier) {
          return entities[identifier];
        },
        markPresentOnGraph: function (graphElement) {
          var ids = getIdentifiers(graphElement);
          entityToJointModelMap[ids.typeIdentifier][ids.uniqueId] = graphElement.id;
          var entity = findEntity(ids);

          if (entity) {
            entity.show = false;
          }
        },
        markRemovedFromGraph: function (graphElement) {
          var ids = getIdentifiers(graphElement);

          delete entityToJointModelMap[ids.typeIdentifier][ids.uniqueId];
          var entity = findEntity(ids);

          if (entity) {
            entity.show = true;
          }
        },
        jointModelId: function (typeIdentifier, entity) {
          return entityToJointModelMap[typeIdentifier][entity[GraphHelpers.getModelIdKey()]];
        },
        remove: function (entity, identifier) {
          var entityId = entity[GraphHelpers.getModelIdKey()],
            entityIndex = entities[identifier].indexOf(entity);

          delete entityToJointModelMap[identifier][entityId];
          entities[identifier].splice(entityIndex, 1);
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('GraphHelpers', ['$q', 'JointGraphConfig',
    function ($q, JointGraphConfig) {
      function getProperties(identifier) {
        var modelIdKey = JointGraphConfig.modelIdKey || 'id',
          properties;

        if (identifier) {
          properties = JointGraphConfig.entityModelProperties ?
            JointGraphConfig.entityModelProperties[identifier] : null;
        } else {
          properties = JointGraphConfig.linkModelProperties;
        }

        if (angular.isArray(properties)) {
          return angular.copy(properties).concat(modelIdKey);
        } else {
          return [modelIdKey];
        }
      }

      function getModelIdKey() {
        return JointGraphConfig.modelIdKey ? JointGraphConfig.modelIdKey : 'id';
      }

      return {
        queryResource: function (resourceClass) {
          var deferred = $q.defer();

          resourceClass.query(function (response) {
            deferred.resolve(response);
          }, function (error) {
            deferred.reject(error);
          });

          return deferred.promise;
        },
        getModelIdKey: getModelIdKey,
        entityProperties: function (identifier) {
          return getProperties(identifier);
        },
        linkProperties: function () {
          return getProperties();
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('GraphLinks', ['GraphHelpers',
    function (GraphHelpers) {
      var links = [];

      function findLink(graphModel) {
        var backendModelParams = graphModel.get('backendModelParams'),
          modelIdKey = GraphHelpers.getModelIdKey();

        return links.filter(function (link) {
          return link[modelIdKey] === backendModelParams[modelIdKey];
        })[0];
      }

      return {
        set: function (linksArray) {
          links = linksArray;
        },
        addSingle: function (entity) {
          links.push(entity);
        },
        getSingle: function (graphElement) {
          return findLink(graphElement);
        },
        remove: function (graphElement) {
          links.splice(links.indexOf(findLink(graphElement)), 1);
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('GraphSelection', ['JointGraph', 'JointPaper', 'GraphHelpers', 'GraphEntities', 'GraphLinks', 'FactoryMap',
    function (JointGraph, JointPaper, GraphHelpers, GraphEntities, GraphLinks, FactoryMap) {
      var selection,
        selectionChangeCallback;

      function updateSelection() {
        var cell = JointGraph.getCell(selection.selectedCellId);

        if (cell) {
          var modelValues = {},
            isChartNode = cell.get('isChartNode'),
            paramsFactory = isChartNode ?
            FactoryMap.get('JointNodeParams') :
            FactoryMap.get('JointLinkParams');

          if (paramsFactory) {
            var properties = isChartNode ?
              GraphHelpers.entityProperties(selection.entityIdentifier) :
              GraphHelpers.linkProperties();

            properties.forEach(function (propertyKey) {
              modelValues[propertyKey] = selection.selectedResource[propertyKey];
            });

            var attributes = paramsFactory.computed(modelValues);

            if (attributes) {
              cell.attr(attributes);
            }
          }
        }
      }

      function notifySelectionChange() {
        if (angular.isFunction(selectionChangeCallback)) {
          selectionChangeCallback(selection);
        }
      }

      function revertNoNotify() {
        if (selection) {
          angular.copy(selection.masterResource, selection.selectedResource);
          updateSelection();
        }
      }

      return {
        onSelectionChange: function (callback) {
          selectionChangeCallback = callback;
        },
        select: function (selectedIds) {
          revertNoNotify();

          if (selectedIds) {
            var cell = JointGraph.getCell(selectedIds.selectedCellId),
              entity = selectedIds.isChartNode ?
              GraphEntities.getSingle(cell) :
              GraphLinks.getSingle(cell);

            selection = {
              isChartNode: selectedIds.isChartNode,
              selectedResource: entity,
              selectedCellId: selectedIds.selectedCellId,
              masterResource: angular.copy(entity),
              entityIdentifier: selectedIds.entityIdentifier
            };
          } else {
            selection = null;
          }

          notifySelectionChange();
        },
        selectEntity: function (entity, identifier) {
          revertNoNotify();

          selection = {
            isChartNode: true,
            selectedResource: entity,
            selectedCellId: GraphEntities.jointModelId(identifier, entity),
            masterResource: angular.copy(entity),
            entityIdentifier: identifier
          };

          notifySelectionChange();
        },
        getSelectedEntity: function () {
          return selection ? selection.selectedResource : null;
        },
        revertSelection: function () {
          if (selection) {
            angular.copy(selection.masterResource, selection.selectedResource);
            updateSelection();
            notifySelectionChange();
          }
        },
        syncSelection: function () {
          if (selection) {
            angular.copy(selection.selectedResource, selection.masterResource);
            updateSelection();
            notifySelectionChange();
          }
        },
        clear: function () {
          JointPaper.clearSelection();
          selection = null;
          notifySelectionChange();
        },
        clearAndRevert: function () {
          JointPaper.clearSelection();
          revertNoNotify();
          selection = null;
          notifySelectionChange();
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointChartLink', ['$q', 'JointLinkDefaults', 'JointResourceModel', 'FactoryMap', 'GraphHelpers', 'JointGraphResources',
    function ($q, JointLinkDefaults, JointResourceModel, FactoryMap, GraphHelpers, JointGraphResources) {
      return {
        create: function (params) {
          var configObject = FactoryMap.get('LinkFactory') || {};
          configObject.resource = JointGraphResources.get().entityRelations;

          var Factory = JointResourceModel.forLink(configObject),
            backendModelParams = {},
            properties = GraphHelpers.linkProperties();

          properties.forEach(function (prop) {
            backendModelParams[prop] = 'undefined';
          });

          var defaults = {
            backendModelParams: backendModelParams,
            attrs: JointLinkDefaults.get(backendModelParams).attrs,
            isChartNode: false
          };

          return Factory.create(angular.extend(defaults, params));
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointChartNode', ['JointResourceModel', 'FactoryMap', 'GraphHelpers', 'JointGraphResources',
    function (JointResourceModel, FactoryMap, GraphHelpers, JointGraphResources) {
      function getFactory(entityAttributes) {
        if (entityAttributes[GraphHelpers.getModelIdKey()] === 'undefined') {
          var entityIdentifier = entityAttributes.entityIdentifier,
            configObject = FactoryMap.get(entityIdentifier) || {};

          configObject.resource = JointGraphResources.get().entities[entityIdentifier];
          return JointResourceModel.forNewEntity(configObject);
        } else {
          return JointResourceModel.forExistingEntity();
        }
      }

      var cross = "";
      return {
        create: function (entityAttributes, dropPoint) {
          var EntityFactory = getFactory(entityAttributes),
            ParamsFactory = FactoryMap.get('JointNodeParams'),
            params = {
              position: {
                x: dropPoint.x,
                y: dropPoint.y
              },
              backendModelParams: entityAttributes,
              options: {
                interactive: true
              },
              isChartNode: true
            };
          if (ParamsFactory) {
            if(entityAttributes.nonRemovalbe == true){
              cross = ParamsFactory.defaults['.cross'];
              ParamsFactory.defaults['.cross'] = undefined;
            }
            else {
              ParamsFactory.defaults['.cross'] = cross;
            }
            params.attrs = ParamsFactory.computed(entityAttributes);
          }

          return EntityFactory.create(params);
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointElementView', ['$window', 'JointChartLink',
    function ($window, JointChartLink) {
      function initElementView($container) {
        $window.joint.shapes.html.ElementView = $window.joint.dia.ElementView.extend({
          link: null,
          canUpdateLink: false,
          render: function () {
            $window.joint.dia.ElementView.prototype.render.apply(this, arguments);

            this.findBySelector('.connection-port').on('mousedown', this.createLink.bind(this));

            var removeElementView = this.findBySelector('.remove-element');
            var showPopoverElementView = this.findBySelector('.editDag-element');
            var self = this;

            removeElementView.on('mousedown', function (event) {
              // Prevent drag
              event.stopPropagation();
            });

            removeElementView.on('click', function (event) {
              self.paper.model.getConnectedLinks(self.model).forEach(function (link) {
                link.remove({
                  skipGraphSave: true
                });
              });
              self.model.remove();
              self.model.trigger('nodeRemoved', event, self.model);
            });

            //dagPopover
            showPopoverElementView.on('mousedown', function (event) {
              // Prevent drag
              event.stopPropagation();
            });

            showPopoverElementView.on('click', function (event) {
              //$('#dagFlowEdit').modal('show');
            });

            this.paper.$el.mousemove(this.onMouseMove.bind(this));
            this.paper.$el.mouseup(this.onMouseUp.bind(this));
            return this;
          },
          createLink: function (evt) {
            var paperOffset = this.paper.$el.offset(),
              targetOffset = $(evt.target).offset(),
              x = targetOffset.left - paperOffset.left,
              y = targetOffset.top - paperOffset.top;

            evt.stopPropagation();
            $window.V(this.el).addClass('source-view');

            this.model.trigger('createLinkStart');

            this.link = JointChartLink.create({
              source: {
                id: this.model.get('id')
              },
              target: $window.g.point(x, y)
            });
            this.paper.model.addCell(this.link);

            this.linkView = this.paper.findViewByModel(this.link);
            this.linkView.startArrowheadMove('target');

            this.link.on('change:target', function (link) {
              // we short-circuit the allowed function to avoid highlighting self as forbidden
              if (link.invalidTarget() || link.allowed()) {
                link.colorLinkAllowed();
                link.removeLinkLabels();
                link.removeForbiddenHighlight();
              } else {
                link.colorLinkForbidden();
                link.addLinkForbiddenLabel();
                link.addForbiddenHighlight();
              }
            });

            this.canUpdateLink = true;
          },
          onMouseUp: function (evt) {
            if (this.linkView) {
              this.link.addLinkMidpoint();

              $window.V(this.el).removeClass('source-view');

              // let the linkview deal with this event
              this.linkView.pointerup(evt, evt.clientX, evt.clientY);

              this.link.colorLinkCreated();

              this.link.removeForbiddenHighlight();

              if (this.link.allowed()) {
                this.model.trigger('createLinkEnd', this.link.id, this.link.get('target').id);
              } else {
                this.link.remove({
                  skipCallbacks: true
                });
              }

              delete this.linkView;
              this.model.trigger('batch:stop');
            }

            this.canUpdateLink = false;
            this.paper.$el.find('.component').css('z-index', 1);
          },
          onMouseMove: function (evt) {
            if (!this.link || !this.canUpdateLink || evt.clientX <= 10) {
              return;
            }

            if (this.linkView) {
              // let the linkview deal with this event
              this.linkView.pointermove(evt, evt.clientX, evt.clientY);
            }

            var containerOffset = $container[0].getBoundingClientRect();
            this.link.set('target', $window.g.point(evt.clientX - containerOffset.left,
              evt.clientY - containerOffset.top));
          }
        });
      }

      return {
        init: function ($container) {
          initElementView($container);
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointGraph', ['$window',
    function ($window) {
      return new $window.joint.dia.Graph();
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .provider('JointGraphConfig', ['FactoryMapProvider',
    function (FactoryMapProvider) {
      var config;

      this.init = function (configObj) {
        config = configObj;

        FactoryMapProvider.register(config.linkCreationCallbacks, 'LinkFactory');
        FactoryMapProvider.register(config.entityMarkupParams, 'JointNodeParams');
        FactoryMapProvider.register(config.linkMarkupParams, 'JointLinkParams');

        Object.keys(config.entityCreationCallbacks).forEach(function (key) {
          FactoryMapProvider.register(config.entityCreationCallbacks[key], key);
        });
      };

      this.$get = [
        function () {
          if (config) {
            return config;
          } else {
            throw new Error('JointGraphConfig provider must be initialized in a config block');
          }
        }
      ];
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointGraphResources', [
    function () {
      var resources;

      return {
        set: function (resourcesObj) {
          resources = resourcesObj;
        },
        get: function () {
          return resources;
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointLinkDefaults', ['FactoryMap',
    function (FactoryMap) {
      var defaults = {
        attrs: {
          '.marker-target': {
            d: 'M 10 0 L 0 5 L 10 10 z'
          },
          '.marker-source': {
            display: 'none'
          },
          '.marker-vertex-remove-area': {
            display: 'none'
          },
          '.marker-vertex-remove': {
            display: 'none'
          }
        },
        linkForbiddenLabel: {
          position: 0.5,
          attrs: {
            text: {
              text: '  Link not allowed  '
            }
          }
        }
      };

      return {
        get: function (backendModelParams) {
          var paramsFactory = FactoryMap.get('JointLinkParams');
          if (paramsFactory) {
            angular.extend(defaults, paramsFactory.get(backendModelParams));
          }

          return defaults;
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointLinkModel', ['$window', 'JointPaper', 'JointLinkDefaults',
    function ($window, JointPaper, JointLinkDefaults) {
      var LinkModel;

      function createModel() {
        if (LinkModel) {
          return LinkModel;
        }

        var linkDefaults = JointLinkDefaults.get();

        LinkModel = $window.joint.dia.Link.extend();
        //Any methods that should be common to all node instances should be prototyped
        //on the new constructor class here.

        LinkModel.prototype.colorLinkAllowed = function () {
          var selector = $window.V(JointPaper.getPaper().findViewByModel(this).el);
          selector.removeClass('forbidden');
          selector.addClass('allowed');
        };

        LinkModel.prototype.colorLinkForbidden = function () {
          var selector = $window.V(JointPaper.getPaper().findViewByModel(this).el);
          selector.removeClass('allowed');
          selector.addClass('forbidden');
        };

        LinkModel.prototype.colorLinkCreated = function () {
          var selector = $window.V(JointPaper.getPaper().findViewByModel(this).el);
          selector.removeClass('allowed');
          selector.removeClass('forbidden');
        };

        LinkModel.prototype.addLinkForbiddenLabel = function () {
          this.set('labels', [linkDefaults.linkForbiddenLabel]);
        };

        LinkModel.prototype.removeLinkLabels = function () {
          this.unset('labels');
        };

        function getSourceAndTargetViews(link) {
          var paper = JointPaper.getPaper(),
            linkView = paper.findViewByModel(link),
            sourceView = linkView.sourceView,
            targetView;

          if (linkView.targetView) {
            targetView = linkView.targetView;
          } else {
            var target = link.get('target');
            targetView = paper.findViewsFromPoint($window.g.point(target.x, target.y))[0];
          }

          return [sourceView, targetView];
        }

        LinkModel.prototype.toggleForbiddenHighlight = function (toggleOn) {
          getSourceAndTargetViews(this).forEach(function (view) {
            if (view) {
              var selector = $window.V(view.el),
                method = toggleOn ? selector.addClass : selector.removeClass;

              method.call(selector, 'nolink');
            }
          });
        };

        LinkModel.prototype.addForbiddenHighlight = function () {
          this.toggleForbiddenHighlight(true);
        };

        LinkModel.prototype.removeForbiddenHighlight = function () {
          this.toggleForbiddenHighlight(false);
        };

        LinkModel.prototype.addLinkMidpoint = function () {
          var linkView = JointPaper.getPaper().findViewByModel(this),
            vertexPoint = $window.g.line(
              $window.g.point(linkView.sourcePoint),
              $window.g.point(linkView.targetPoint)
            ).midpoint();

          this.set('vertices', [{
            x: vertexPoint.x,
            y: vertexPoint.y
          }]);
          this.attr('.marker-vertex/r', '5');
        };

        LinkModel.prototype.allowed = function () {
          if (this.invalidTarget()) {
            return false;
          }

          if (linkDefaults.canCreateLink) {
            return linkDefaults.canCreateLink.apply(null, getSourceAndTargetViews(this));
          } else {
            return true;
          }
        };

        LinkModel.prototype.invalidTarget = function () {
          var endViews = getSourceAndTargetViews(this),
            emptyTarget = !endViews[1],
            sameObject = endViews[0] === endViews[1];

          return emptyTarget || sameObject;
        };

        return LinkModel;
      }

      return {
        getConstructor: createModel
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointNodeModel', ['$window', '$templateCache', 'FactoryMap',
    function ($window, $templateCache, FactoryMap) {
      var ModelConstructor = $window.joint.shapes.basic.Generic.extend({
        markup: $templateCache.get('graphNode'),
        defaults: $window.joint.util.deepSupplement({
          // The corresponding html.ElementView is defined
          // in the JointElementView service.
          type: 'html.Element',
          attrs: FactoryMap.get('JointNodeParams').defaults
        }, $window.joint.shapes.basic.Generic.prototype.defaults)
      });

      //Any methods that should be common to all node instances should be prototyped
      //on the new ModelConstructor class here.

      $window.joint.shapes.html = {
        Element: ModelConstructor
      };

      return {
        getConstructor: function () {
          return ModelConstructor;
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointPaper', ['$window', 'JointGraph', 'GraphHelpers',
    function ($window, JointGraph, GraphHelpers) {
      var paper,
        selectedModelId;

      return {
        init: function ($element) {
          paper = new $window.joint.dia.Paper({
            el: $element[0],
            width: '100%',
            height: '100%',
            gridSize: 1,
            model: JointGraph,
            interactive: {
              vertexAdd: false
            },
            perpendicularLinks: true
          });
        },
        getPaper: function () {
          return paper;
        },
        clearSelection: function () {
          if (selectedModelId) {
            var cell = JointGraph.getCell(selectedModelId);

            if (cell) {
              var view = paper.findViewByModel(cell);
              $window.V(view.el).removeClass('selected');
            }

            selectedModelId = null;
          }
        },
        selectCell: function (cellView) {
          $window.V(cellView.el).addClass('selected');
          selectedModelId = cellView.model.get('id');

          var backendModelParams = cellView.model.get('backendModelParams'),
            isChartNode = cellView.model.get('isChartNode') ? true : false,
            modelIdKey = GraphHelpers.getModelIdKey(),
            backendModelId = backendModelParams[modelIdKey],
            identifier = backendModelParams.entityIdentifier;

          return {
            backendModelId: backendModelId,
            selectedCellId: selectedModelId,
            isChartNode: isChartNode,
            entityIdentifier: identifier
          };
        },
        onSelectionChange: function (callback) {
          var self = this;

          paper.on('blank:pointerdown', function () {
            self.clearSelection();
            callback(null);
          });

          paper.on('cell:pointerclick', function (cellView) {
            self.clearSelection();
            callback(self.selectCell(cellView));
          });
        },
        onCellPositionChange: function (callback) {
          var downX, downY;

          paper.on('cell:pointerdown', function (cell, x, y) {
            downX = x;
            downY = y;
          });

          paper.on('cell:pointerup', function (cell, x, y) {
            if (downX && downY) {
              var deltaX = Math.abs(downX - x),
                deltaY = Math.abs(downY - y);

              if (deltaX > 10 || deltaY > 10) {
                callback();
              }

              downX = null;
              downY = null;
            }
          });
        }
      };
    }
  ]);

'use strict';
angular.module('angular-jointjs-graph')
  .factory('JointResourceModel', ['JointNodeModel', 'JointLinkModel', '$q',
    function (JointNodeModel, JointLinkModel, $q) {
      function wrapModel(JointModel) {
        var ModelConstructor = JointModel.getConstructor();
        //We need a wrapper model around the original constructor since we are going to conditionally
        //prototype methods on it that shouldn't be available on all model instances.
        function Model(params) {
          ModelConstructor.call(this, params);
        }

        Model.prototype = Object.create(ModelConstructor.prototype);
        Model.prototype.constructor = ModelConstructor;
        return Model;
      }

      function Factory(Model) {
        return {
          create: function (params) {
            return new Model(params);
          }
        };
      }

      function createFactoryForExisting(JointModel, configObject) {
        var Model = wrapModel(JointModel);
        Model.prototype.createResource = function () {
          var deferred = $q.defer(),
            postData = {},
            self = this;

          if (angular.isFunction(configObject.postDataFn)) {
            postData = configObject.postDataFn(this);
          }

          configObject.resource.save({}, postData, function (response) {
            var params = self.get('backendModelParams');

            Object.keys(params).forEach(function (key) {
              if (response.hasOwnProperty(key)) {
                params[key] = response[key];
              }
            });

            if (angular.isFunction(configObject.modelUpdateCallback)) {
              configObject.modelUpdateCallback(self, response);
            }

            deferred.resolve(response);
          }, function (errData) {
            deferred.reject(errData);
          });

          return deferred.promise;
        };

        return new Factory(Model);
      }

      return {
        forExistingEntity: function () {
          return new Factory(wrapModel(JointNodeModel));
        },
        forNewEntity: function (configObject) {
          return createFactoryForExisting(JointNodeModel, configObject);
        },
        forLink: function (configObject) {
          return createFactoryForExisting(JointLinkModel, configObject);
        }
      };
    }
  ]);
