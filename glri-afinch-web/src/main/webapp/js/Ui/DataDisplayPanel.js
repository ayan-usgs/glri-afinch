Ext.ns("AFINCH.ui");

AFINCH.ui.DataDisplayPanel = Ext.extend(Ext.Panel, {

    constructor: function(config) {
        var self = this;
		
		//attach the contained components so that they can be easily referenced later
		var graphPanel = new AFINCH.ui.StatsGraphPanel();
		var toggleBar = new AFINCH.ui.SeriesToggleToolbar({
			graphPanel: graphPanel,
			paramName: config.legendParamName
		});
        var labelPanel = new AFINCH.ui.StatsLabelPanel();
        
        config = Ext.apply({
			
			/* Expected Params */
			record: config.record, 
			thredds_filename: config.thredds_filename,	/* Filename of the thredds NetCDF file */
			id_prop: config.id_prop,			/* ID prop in the thredds file */
			observed_prop: config.observed_prop,		/* main property in the thredds file */
			legendParamName: config.legendParamName,
			yAxixParamName: config.yAxixParamName,
			unit: config.unit,
			
			/* Quick access subcomponents */
			toggleBar: toggleBar,
			graphPanel: graphPanel,
			labelPanel: labelPanel,
			
			/* Status Flags */
			active: false,			/* True when the tab is active. */
			statsData: undefined,	/* Stats received from R process */
			statsRendered: false,	/* false until stats data is received and added to the graph */
			graphData: {	/* SOS values */
				values: undefined,
				headers: undefined
			},
			
            tbar: toggleBar,
            title: config.title,
            layout : 'hbox',
            items: [graphPanel, labelPanel],
			listeners: {
                activate: function(panel) { panel.doActivate(); },
				deactivate: function(panel) { panel.doDeactivate(); }
            }
        
        }, config);

        AFINCH.ui.DataDisplayPanel.superclass.constructor.call(this, config);
        LOG.info('AFINCH.ui.DataDisplayPanel::constructor(): Construction complete.');
    },
	
	doInitLoad: function() {
		//establish scope
		var self = this;
		self.sosUrlWithoutBase = self.thredds_filename + 
				'?service=SOS&request=GetObservation&Version=1.0.0&offering=' +
				self.record.data[self.id_prop] +
				'&observedProperty=' + self.observed_prop;
		// interim fix for GLRI-AFINCH while it lives at glridev, glriqa, and glriprod
		// can be removed once glridev, glriqa, and glriprod have their own thredds
		// servers. For the time being, they still point back to wsprod.
		var parser = document.createElement('a');
		parser.href = CONFIG.endpoint.thredds;
		var threddsServer = 'http://' + parser.host + '/glri-afinch/';
		// end interim fix
		Ext.Ajax.request({
			// url: CONFIG.endpoint.threddsProxy + self.sosUrlWithoutBase, 
			url: threddsServer + CONFIG.endpoint.threddsProxy + self.sosUrlWithoutBase, // also a part of the interim fix
			success: self.sosCallback,
			scope: self
		});
	},
	
	doActivate: function() {
		this.active = true;
		this.tryGraphRender();
		this.tryStatsRender();
	},
	
	doDeactivate: function() {
		this.active = false;
	},
	
	/**
	 * Safe to call multiple times:  when the tab panel is shown and when data arrives.
	 * The graph library has issues rendering into a hidden panel, so defer
	 * rendering until the tab is visible and we have data.
	 * @returns {undefined}
	 */
	tryGraphRender: function() {
		var self = this;
		var win = self.findParentByType('dataWindow');

		if(! win.isVisible()){ return;	/* user closed the window */ }
		
		if (self.active && (! self.graphPanel.graph) && self.graphData.values) {
			self.graphPanel.graph = AFINCH.ui.FlowDygraph(
				self.graphPanel.getEl().dom, 
				self.labelPanel.getEl().dom,
				self.graphData.values,
				self.legendParamName,
				self.yAxixParamName,
				self.unit);

			//attach the info to the graphPanel for easy access during data export
			self.graphData.headers = self.graphPanel.graph.getLabels();
			
			self.doLayout();
		}
	},
	
	/**
	 * Safe to call multiple times:  when the tab panel is shown and when data arrives.
	 * The graph library has issues rendering into a hidden panel, so defer
	 * rendering until the tab is visible and we have data.
	 * @returns {undefined}
	 */
	tryStatsRender: function() {
		var self = this;
		var win = self.findParentByType('dataWindow');

		if(! win.isVisible()){ return;	/* user closed the window */ }

		if (self.active && self.graphPanel.graph && self.statsData && (!self.statsRendered)) {

			self.statsRendered = true;
			
			var statsStores = self.statsData;
			
			var data = self.graphData.values;

			var decileValues = [];//this will be appended onto the end of every row of the new data
			statsStores.deciles.each(function(record){
			   decileValues.push(record.get('q'));
			});

			/**
			 * Declare some constants to be used in the table update:
			 * 
			 * - Variables with 'Index' in the name are indexing columns in the 
			 * array of arrays that we will pass to Dygraphs
			 * 
			 * - Variables with 'ColumnName' in the name refer to field names in the StatStores
			 * 
			 */

			var dateIndex = 0,
				annualMeanIndex = 2,
				annualMedianIndex = 3,
				monthlyMeanIndex = 4,
				monthlyMedianIndex = 5,
				lowestDecileIndex = 6,
				highestDecileIndex = 15,
				yearColumnName = 'Year', //these are the column names returned by the RWPS call
				monthColumnName = 'Month',
				meanFlowColumnName = 'meanq',
				medianFlowColumnName = 'medianq';

			data = data.map(function(row){
				var month = row[dateIndex].getMonth();
				//native javascript months are 0-indexed
				//but the RWPS process feeds the stats store a 1-based month index.
				//so...
				var extStoreMonth = month+1;
				var isJanuary = 0 === month;
				if(isJanuary){
					//add the annual stats
					var year = row[dateIndex].getFullYear();
					row[annualMeanIndex] = statsStores.mean_annual_flow.query(yearColumnName, year).first().get(meanFlowColumnName);
					row[annualMedianIndex] = statsStores.median_annual_flow.query(yearColumnName, year).first().get(medianFlowColumnName);
				}
				//use the ext-adjusted storeMonth in the statsStores queries
				row[monthlyMeanIndex] = statsStores.mean_monthly_flow.query(monthColumnName, extStoreMonth).first().get(meanFlowColumnName);
				row[monthlyMedianIndex] = statsStores.median_monthly_flow.query(monthColumnName, extStoreMonth).first().get(medianFlowColumnName);
				//append the deciles to the end of the row
				for(var i = lowestDecileIndex; i < highestDecileIndex; i++){
					row[i] = decileValues[i-lowestDecileIndex];
				}
				return row;
			});

			self.graphPanel.graph.updateOptions({
			   labels: self.graphData.headers,
			   file: data
			});

			//now enable the series toggle buttons
			var tbar = self.getTopToolbar()
			var checkedItems = tbar.getSeriesTogglers();
			checkedItems.each(function(checkedItem){
				checkedItem.enable();
				checkedItem.fireEvent('checkchange', checkedItem, 
						checkedItem.initialConfig.checked, 
						self.graphPanel.graph,
						tbar.menu
					);
			});
			
			self.doLayout();
		}
	},
	
	/**
	* @param ajax - response
	* @param options - the options that initiated the Ajax request
	* @scope the window in which the data will be visualized
	*/
	sosCallback: function(response, options) {
		//establish scope
		var self = options.scope;

		//IE doesn't always populate this property, parse the text if necessary
		if(!response.responseXML){
			response.responseXML = $.parseXML(response.responseText);
		}
		
		if(response.responseText.toLowerCase().indexOf('exception') !== -1){
			AFINCH.ui.errorNotify("Error retrieving data from server. See browser logs for details.");
			LOG.error(response.responseText);
		} else {
			
			var responseTxt = $(response.responseXML).find('swe\\:values').text();
			if (0 === responseTxt.length){
				responseTxt = $(response.responseXML).find('values').text();
			}
			var numFieldsToLoadLater = 13;
			self.graphData.values = AFINCH.data.parseSosResponse(responseTxt, numFieldsToLoadLater);

			//kick off the next ajax call...
			console.log('Thredds URL:');
			console.log(CONFIG.endpoint.thredds);
			var rParams = {
				sosEndpointUrl: CONFIG.endpoint.thredds + self.sosUrlWithoutBase
			};

			var tempStatsStore = new AFINCH.data.StatsStore();

			tempStatsStore.load({
				params: rParams,
				scope: self,
				callback: self.statsCallback
			});  
			
			self.tryGraphRender();
		}
	},
	   
	/**
	 *@param statsStores - array of StatStores
	 *@param success - whether or not the request was successful
	 */
	statsCallback: function(statsStores, success) {
		var self = this;

		if(!success || !statsStores){
			new Ext.ux.Notify({
				msgWidth: 200,
				title: 'Error',
				msg: "Error retrieving data from server. See browser logs for details."
			}).show(document);
			return;
		}

		//put stores into a title-to-store map for convenient access later
		var tempStores = {};
		statsStores.each(function(store){
		   tempStores[store.title] = store; 
		});
		self.statsData = tempStores;

		self.tryStatsRender();

    }
});