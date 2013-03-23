Ext.ns("AFINCH.ui");

AFINCH.ui.DataWindow = Ext.extend(Ext.Window, {
    constructor: function(config) {
        var self = this;
        var title = config.title || "";
        var width = config.width || 1000;
        var height = config.height || 500;
        
        var buttonGroup = new AFINCH.ui.SeriesToggleButtonGroup({
           width: "100%"
        });
               //attach the contained components so that they can be easily referenced later
        self.graphPanel = new AFINCH.ui.StatsGraphPanel();
        self.labelPanel = new AFINCH.ui.StatsLabelPanel();
        
        config = Ext.apply({
            width: width,
            height: height,
            tbar: buttonGroup,
            title: title,
            collapsible: true,
            layout : 'hbox',
            fbar: new AFINCH.ui.DataExportToolbar(),
            items: [self.graphPanel, self.labelPanel]
        }, config);

        AFINCH.ui.DataWindow.superclass.constructor.call(this, config);
        LOG.info('AFINCH.ui.DataWindow::constructor(): Construction complete.');
    }
});
Ext.reg('dataWindow', AFINCH.ui.DataWindow);