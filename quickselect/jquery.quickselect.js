// Credit to Anders Retterås for adding functionality preventing onblur event to fire on text input when clicking on scrollbars in MSIE / Opera.
jQuery.shadowObject = function(object){
  var shadower = function(){}; shadower.prototype = object;
  return new shadower();
};

(function($){
  // The job of the QuickSelect object is to encapsulate all the state of a select control and manipulate the DOM and interface events.
  var QuickSelect = function($input_element, options){
    $input_element = $($input_element);
    var self = this;

    // Save the state of the control
      var AllItems = {indexed:{}}; // hash of "index" -> [items], where index is the query that retrieves or filters the results.
      var clickedLI = true; // just a state variable for IE scrollbars.
      var activeSelection = -1;
      var hasFocus = false;
      var last_keyCode;
      var previous_value;
      var timeout;
      var ie_stupidity = false;
      if(/MSIE (\d+\.\d+);/.test(navigator.userAgent)){ //test for MSIE x.x;
        var ieversion = new Number(RegExp.$1); // capture x.x portion and store as a number
        if(ieversion <= 7) ie_stupidity=true;
      }

    // Create the list DOM
      var results_list = $('<div class="'+options.resultsClass+'" style="display:block;position:absolute"></div>').hide();
      // Supposedly if we position an iframe behind the results list, before we position the results list, it will hide select elements in IE.
      var results_mask = $('<iframe style="border:none" />');
      results_mask.css({position:'absolute'})
    	if(options.width>0){
    	  results_list.css("width", options.width);
    	  results_mask.css("width", options.width);
    	}
    	$('body').append(results_list);
      if(ie_stupidity) $('body').append(results_mask)

    // Set up all of the methods
      var getLabel = function(item){
        return item.label || (typeof(item)=='string' ? item : item[0]) || ''; // hash:item.label; string:item; array:item[0]
      };
      var getValues = function(item){
        return item.values || (item.value ? [item.value] : (typeof(item)=='string' ? [item] : item)) || []; // hash:item.values || item.value; string:item; array:item[1..end]
      };
      var matchers = {
        quicksilver : function(q,data){
          q = q.toLowerCase();
          console.log("matching '"+q+"' via quicksilver");
          console.log(data);
    			AllItems.indexed[q] = [];
          for(var i in data){
            // get the label from the data item
            var label = getLabel(data[i]).toLowerCase();
            // Filter by match/no-match
            if(label.score(q)>0) AllItems.indexed[q].push(data[i]);
    			}
          // Sort by match relevance
    			return AllItems.indexed[q].sort(function(a,b){
            a = getLabel(a);
            b = getLabel(b);
        	  var as = a.toLowerCase().score(q);
            var bs = b.toLowerCase().score(q);
            return(as > bs ? -1 : (bs > as ? 1 : 0));
          });
        },
        contains : function(q,data){
          q = q.toLowerCase();
          console.log("matching '"+q+"' via contains");
          console.log(data);
          AllItems.indexed[q] = [];
          for(var i in data){
            var label = getLabel(data[i]).toLowerCase();
            if(label.indexOf(q)>-1) AllItems.indexed[q].push(data[i]);
          }
    			return AllItems.indexed[q].sort(function(a,b){
            a = getLabel(a).toLowerCase();
            b = getLabel(b).toLowerCase();
            qs = q.toLowerCase();
            // order by proximity of match to beginning of the label, secondly by alphabetic order
            return(a.indexOf(qs) > b.indexOf(qs) ? -1 : (a.indexOf(qs) < b.indexOf(qs) ? 1 : (a > b ? -1 : (b > a ? 1 : 0))));
          });
        },
        startsWith : function(q,data){
          q = q.toLowerCase();
          console.log("matching '"+q+"' via startsWith");
          console.log(data);
          AllItems.indexed[q] = [];
          for(var i in data){
            var label = getLabel(data[i]).toLowerCase();
            if(label.indexOf(q)==0) AllItems.indexed[q].push(data[i]);
          }
    			return AllItems.indexed[q].sort(function(a,b){
            a = getLabel(a).toLowerCase();
            b = getLabel(b).toLowerCase();
            // alphabetic order of labels
            return(a > b ? -1 : (b > a ? 1 : 0));
          });
        }
      };
      var finders = {
        store : function(q,callback){
          console.log("finding via store");
          callback(options.data);
        },
        ajax  : function(q,callback){
          console.log("finding via ajax");
          var url = options.ajax + "?q=" + encodeURI(q);
        	for(var i in options.ajaxParams){
        		url += "&" + i + "=" + encodeURI(options.ajaxParams[i]);
        	}
          $.getJSON(url, callback);
        }
      };
     	var moveSelect = function(step_or_li){
    		var lis = $('li', results_list);
    		if(!lis)return;

     	  if(typeof(step_or_li)=="number") activeSelection = activeSelection + step_or_li;
     	  else activeSelection = lis.index(step_or_li);

    		if(activeSelection < 0) activeSelection = 0;
    		  else if(activeSelection >= lis.size())
    		    activeSelection = lis.size() - 1;

        console.log("Moved selection to "+activeSelection+".");

    		lis.removeClass(options.selectedClass);
    		$(lis[activeSelection]).addClass(options.selectedClass);

        if(options.autoFill && this.last_keyCode != 8){ // autoFill value, if option is set and the last user key pressed wasn't backspace
          // 1. Fill in the value (keep the case the user has typed)
      		$input_element.val(previous_value + $(lis[activeSelection]).text().substring(previous_value.length));
      		// 2. SELECT the portion of the value not typed by the user (so the next character will erase if they continue typing)
            var sel_start = previous_value.length;
            var sel_end = $input_element.val().length;
            var field = $input_element.get(0);
          	if(field.createTextRange){
          		var selRange = field.createTextRange();
          		selRange.collapse(true);
          		selRange.moveStart("character", sel_start);
          		selRange.moveEnd("character", sel_end);
          		selRange.select();
          	} else if(field.setSelectionRange){
          		field.setSelectionRange(sel_start, sel_end);
          	} else if(field.selectionStart){
        			field.selectionStart = sel_start;
        			field.selectionEnd = sel_end;
        		}
          	field.focus();
      	}
    	};
      var selectCurrent = function(){
        var li = $("li."+options.selectedClass, results_list).get(0);
    		if(li){
    			return selectItem(li);
    		} else {
          // No current selection - blank the fields if options.exactMatch and current value isn't valid.
          if(options.exactMatch){
            $input_element.val('');
            options.additional_fields.each(function(i,input){$(input).val('')});
          }
          return false;
    		}
      };
      var selectItem = function(li, from_hide_now_function){
    		if(!li){
    			li = document.createElement("li");
    			li.item = '';
    		}
        var label = getLabel(li.item);
    		$input_element.lastSelected = label;
    		$input_element.val(label); // Set the visible value
    		previous_value = label;
    		results_list.empty(); // clear the results list
    		var values = getValues(li.item);
        options.additional_fields.each(function(i,input){input.value = values[i+1]}); // set the additional fields' values
        if(!from_hide_now_function) hideResultsNow(); // hide the results when something is selected
    		if(options.onItemSelect) setTimeout(function(){ options.onItemSelect(li) }, 1); // run the user callback, if set
    		return true;
      };
      var hideResultsNow = function(){
        console.log("Hiding results now");
        if(timeout) clearTimeout(timeout);
    		$input_element.removeClass(options.loadingClass);
    		if(results_list.is(":visible"))results_list.hide();
    		if(results_mask.is(":visible"))results_mask.hide();
      };
      var repopulate_items = function(items){
        console.log("Populating Items:");
        console.log(items);
        // Clear the results to begin:
        results_list.empty();
      	var ul = document.createElement("ul");
    		results_list.append(ul);
        // If the field no longer has focus or if there are no matches, forget it.
    		if(!hasFocus || items==null || items.length == 0) return hideResultsNow();
    		
      	var total_count = items.length;
      	// limited results to a max number
      	if(options.maxVisibleItems > 0 && options.maxVisibleItems < total_count) total_count = options.maxVisibleItems;

        // Add each item:
        for(var i=0; i<total_count; i++){
          var item = items[i];
      		var li = document.createElement("li");
          results_list.append(li);
    			$(li).text(options.formatItem ? options.formatItem(item, i, total_count) : getLabel(item));

          // Save the extra values (if any) to the li
    			li.item = item;
          // Set the class name, if specified
    			if(item.className) li.className = item.className;
      		ul.appendChild(li);
          console.log(li);
      		$(li).hover(
      			function(){ console.log("Hovering"); moveSelect(this) }, function(){}
      		).click(function(e){ e.preventDefault(); e.stopPropagation(); console.log("Selecting:"); console.log(this); selectItem(this) });
        }

        console.log("Added to list, no auto-fill, auto-select-first, or auto-select-single-match yet.");

        // Lastly, remove the loading class.
        $input_element.removeClass(options.loadingClass);
      };
      var repopulate = function(q,callback){
        console.log("Populating list for query '"+q+"'");
        console.log("Ajax? "+(options.data==null)+", Match Method: "+options.matchMethod+".");
        finders[options.data==null ? 'ajax' : 'store'](q,function(data){
          repopulate_items(matchers[options.matchMethod](q,data));
          callback();
        });
      };
      var show_results = function(){
      	// get the position of the input field before showing the results_list (in case the DOM is shifted)
      	var pos = $input_element.offset();
      	// either use the specified width, or autocalculate based on form element
      	var iWidth = (options.width > 0) ? options.width : $input_element.width();
      	// reposition
      	results_list.css({
      		width: parseInt(iWidth) + "px",
      		top: pos.top + $input_element.height() + 5 + "px",
      		left: pos.left + "px",
      	});
      	if(ie_stupidity) results_mask.css({
      		width: parseInt(iWidth) - 2 + "px",
      		top: pos.top + $input_element.height() + 6 + "px",
      		left: pos.left + 1 + "px",
      		height: results_list.height() - 2+'px'
      	}).show();
      	results_list.show();
      	console.log("Showing list:");
      	console.log(results_list);
        var $lis = $('li', results_list);
        // Option autoSelectFirst, and Option selectSingleMatch (activate the first item if only item)
        if(options.autoSelectFirst || (options.selectSingleMatch && $lis.length == 1)) moveSelect($lis.get(0));
      };
      var onChange = function(){
        console.log("changed! Running matching...");
    		// ignore if non-consequence key is pressed (such as shift, ctrl, alt, escape, caps, pg up/down, home, end, arrows)
    		if(last_keyCode >= 9 && last_keyCode <= 45) return;
        // compare with previous value / store new previous value
    		var q = $input_element.val();
    		if(q == previous_value)return;
    		previous_value = q;
        // if enough characters have been typed, load/populate the list with whatever matches and show the results list.
    		if(q.length >= options.minChars){
    			$input_element.addClass(options.loadingClass);
          // Populate the list, then show the list.
          repopulate(q,show_results);
    		} else { // if too short, hide the list.
    		  if(q.length == 0 && (options.onBlank ? options.onBlank() : true)){ // onBlank callback
    		    options.additional_fields.each(function(i,input){input.value=''});
    		  }
    			$input_element.removeClass(options.loadingClass);
    			results_list.hide();
    			results_mask.hide();
    		}
      };
      
    // Set up the interface events
      // Mark that actual item was clicked if clicked item was NOT a DIV, so the focus doesn't leave the items.
      results_list.mousedown(function(e){clickedLI=e.srcElement.tagName!='DIV'});
      $input_element.keydown(function(e){
        last_keyCode = e.keyCode;
        switch(e.keyCode){
          case 38: // up arrow - select prev item in the drop-down
            console.log("Select previous item");
            e.preventDefault();
            moveSelect(-1);
            break;
          case 40: // down arrow - select next item in the drop-down
            console.log("Select next item");
            e.preventDefault();
            if(!results_list.is(":visible")){
              show_results();
              moveSelect(0);
            } else moveSelect(1);
            break;
          case 13: // return - select item and stay in field
            console.log("Selecting current item and staying here");
            if(selectCurrent()){
              e.preventDefault();
              $input_element.select();
            }
            break;
          case 9:  // tab - select the currently selected, let the regular stuff happen
            console.log("Selecting current item and moving on");
            selectCurrent();
            break;
          case 27: // Esc - deselect any active selection, hide the drop-down but stay in the field
            console.log("Deselecting, hiding drop-down, staying in the field.");
            // Reset the active selection IF must be exactMatch and is not an exact match.
            if(activeSelection > -1 && options.exactMatch && $input_element.val()!=$('li', results_list).get(activeSelection).text()) activeSelection = -1;
        		$('li', results_list).removeClass(options.selectedClass);
         	  hideResultsNow();
            e.preventDefault();
            break
          default:
            console.log("reset timeout");
            if(timeout) clearTimeout(timeout);
            timeout = setTimeout(onChange, options.delay);
            break;
        }
      })
      .focus(function(){
    		// track whether the field has focus, we shouldn't process any results if the field no longer has focus
    		hasFocus = true;
    	})
    	.blur(function(e){
        if(clickedLI){
          if(activeSelection>-1) selectCurrent();
      		// track whether the field has focus
      		hasFocus = false;
      		if(timeout) clearTimeout(timeout);
      		timeout = setTimeout(function(){
      		  hideResultsNow();
            // Select null element, IF options.exactMatch and there is no selection.
            if(options.exactMatch && $input_element.val() != $input_element.lastSelected) selectItem(null,true);
      		}, 200);
        }else{
          e.srcElement.focus();
        }
    	});
  };

  $.fn.quickselect = function(options, data){
    // Prepare options and set defaults.
  	options = options || {};
  	options.data          = (typeof(options.data) == "object" && options.data.constructor == Array) ? options.data : undefined;
  	options.ajaxParams    = options.ajaxParams || {};
  	options.delay         = options.delay || 400;
  	options.minChars      = options.minChars || 1;
  	options.cssFlavor     = options.cssFlavor || 'quickselect';
  	options.inputClass    = options.inputClass || options.cssFlavor+"_input";
  	options.loadingClass  = options.loadingClass || options.cssFlavor+"_loading";
  	options.resultsClass  = options.resultsClass || options.cssFlavor+"_results";
  	options.selectedClass = options.selectedClass || options.cssFlavor+"_selected";
    // matchMethod: (quicksilver | contains | startsWith). Defaults to 'quicksilver' if quicksilver.js is loaded / 'contains' otherwise.
    options.matchMethod   = options.matchMethod || ((typeof ''.score == 'function') && 'l'.score('l') == 1 ? 'quicksilver' : 'contains');
  	if(options.matchCase === undefined) options.matchCase = false;
  	if(options.exactMatch === undefined) options.exactMatch = false;
  	if(options.autoSelectFirst === undefined) options.autoSelectFirst = true;
  	if(options.selectSingleMatch === undefined) options.selectSingleMatch = true;
  	options.maxVisibleItems = options.maxVisibleItems || -1;
  	if(options.autoFill === undefined || options.matchMethod != 'startsWith') options.autoFill = false; // if you're not using the startsWith match, it really doesn't help to autoFill.
  	options.width         = parseInt(options.width, 10) || 0;
    
    // Make quickselects.
  	this.each(function(){
  		var input = this;
      var my_options = $.shadowObject(options);

      if(input.tagName == 'INPUT'){
        // Text input: ready for QuickSelect-ing!
  	    new QuickSelect(input, my_options);

  		} else if(input.tagName == 'SELECT'){
        // Select input: transform into Text input, then make QuickSelect.
      	my_options.delay = my_options.delay || 10; // for selects, we know we're not doing ajax, so we might as well speed up

        // Record the html stuff from the select
        var name = input.name;
        var id = input.id;
        var className = input.className;
        var accesskey = $(input).attr('accesskey');
        var tabindex = $(input).attr('tabindex');
        var selected_option = $("option:selected", input).get(0);

        // Collect the data from the select/options, remove them and create an input box instead.
  		  my_options.data = [];
  		  $('option', input).each(function(i,option){
  		    console.log(option);
  		    my_options.data.push({label : $(option).text(), values : [option.value, option.value], className : option.className});
  		  });

        // Create the text input and hidden input
        var text_input = $("<input type='text' class='"+className+"' id='"+id+"_quickselect' autocomplete='off' accesskey='"+accesskey+"' tabindex='"+tabindex+"' />");
        if(selected_option) text_input.val($(selected_option).text());
        var hidden_input = $("<input type='hidden' id='"+id+"' name='"+input.name+"' />");
        if(selected_option) hidden_input.val(selected_option.value);

        // From a select, we need to work off two values, from the label and value of the select options.
        // Record the first (label) in the text input, the second (value) in the hidden input.
        my_options.additional_fields = hidden_input;
        
        // Replace the select with a quickselect text_input
      	$(input).after(text_input).after(hidden_input).remove(); // add text input, hidden input, remove select.
      	text_input.quickselect(my_options); // make the text input into a QuickSelect.
      }
    });
  };
})(jQuery);
