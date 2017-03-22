angular.module('templates', [])
  .run(['$templateCache',
    function($templateCache) {
      
      $templateCache.put('graphNode',
      '<g>' +
        '<ellipse/>' +
        '<g transform="translate(30, 10)">' +
          '<text class="name"></text>' +
          '<text class="country"></text>' +
        '</g>' +
        '<g transform="translate(120, 25)">' +
          '<text class="icon beneficiary"></text>' +
          '<text class="icon company"></text>' +
          '<text class="icon task"></text>' +
        '</g>' +
        '<g class="connection-port"  transform="translate(0, 10)">' +
          '<circle class="outer"></circle>' +
          '<circle class="inner"></circle>' +
        '</g>' +
        '<g class="remove-element">' +
          '<path class="cross" transform="translate(120, 25)"/>' +
        '</g>' +
         '<g class="editDag-element">' +
         '<foreignobject class="node" x="5" y="2" width="100" height="100"></foreignobject>'+
          '<path  class="editDag" transform="translate(140, 25)"/>' +
        '</g>'+
      '</g>'
      );
      $templateCache.put('dagPopup',
      '<div class="modal-header"> <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button> <h4 class="modal-title" id="myModalLabel">Change Dage Properties</h4> </div> <div class="modal-body" ><form> <div class="form-group"> <label for="name">Name:</label> <input type="text" class="form-control" id="name"> </div> <div class="form-group"> <label for="tags">Tags:</label> <input type="text" class="form-control" id="tags"> </div> <div class="form-group"> <label for="desc">Description:</label> <textarea class="form-control" id="desc"></textarea> </div> <div class="form-group"> <label for="dpdown">Active:</label> <select class="form-control" id="dpdown"><option>Yes</option><option>No</option></select> </div>  </form></div><div class="modal-footer"> <button type="button" class="btn btn-default" data-dismiss="modal">Close</button> <button type="button" class="btn btn-primary" data-dismiss="modal" id="saveDageChanges">Save changes</button></div>'
      );
      $templateCache.put('stagePopup',
        '<div class="modal-header"> <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button> <h4 class="modal-title" id="myModalLabel">Change Stage Properties</h4> </div> <div class="modal-body" ><form> <div class="form-group"> <label for="name">Name:</label> <input type="text" class="form-control" id="name"> </div> </form></div><div class="modal-footer"> <button type="button" class="btn btn-default" data-dismiss="modal">Close</button> <button type="button" class="btn btn-primary" data-dismiss="modal" id="saveDageChanges">Save changes</button></div>'
      );
      $templateCache.put('taskPopup',
      '<div class="modal-header"> <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button> <h4 class="modal-title" id="myModalLabel">Change Task Properties</h4> </div> <div class="modal-body" ><form> <div class="form-group"> <label for="name">Name:</label> <input type="text" class="form-control" id="name"> </div> <div class="form-group"> <label for="dpdown">Dropdown:</label> <select class="form-control" id="dpdown"><option>1</option></select> </div> </form></div><div class="modal-footer"> <button type="button" class="btn btn-default" data-dismiss="modal">Close</button> <button type="button" class="btn btn-primary" data-dismiss="modal" id="saveDageChanges">Save changes</button></div>'
      );
    }
  ]);
