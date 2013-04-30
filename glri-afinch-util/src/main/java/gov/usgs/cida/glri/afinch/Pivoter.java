package gov.usgs.cida.glri.afinch;

import com.google.common.base.Joiner;
import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.joda.time.DateTime;
import org.joda.time.Days;
import ucar.ma2.Array;
import ucar.ma2.DataType;
import ucar.ma2.InvalidRangeException;
import ucar.nc2.Attribute;
import ucar.nc2.Dimension;
import ucar.nc2.NetcdfFile;
import ucar.nc2.NetcdfFileWriter;
import ucar.nc2.Variable;
import ucar.nc2.constants.CDM;
import ucar.nc2.constants.CF;

public class Pivoter {

    private final NetcdfFile ncInput;
    private final Variable oVariable;
    
    private TreeMap<Integer, List<Float>> observationMap = new TreeMap<Integer, List<Float>>();
    private TreeMap<Integer, String> stationMap = new TreeMap<Integer, String>();
    private TreeMap<Integer, Integer> timeMap = new TreeMap<Integer, Integer>();
    
    public Pivoter(NetcdfFile netCDFFile) {
        this.ncInput = netCDFFile;
        this.oVariable = netCDFFile.findVariable("record");
    }
    
    public void pivot() throws IOException, InvalidRangeException {
        long start = System.currentTimeMillis();
        
        BufferedWriter writer = null;
        try {
            writer = new BufferedWriter(new FileWriter("test.csv"));
            Joiner csvJoiner = Joiner.on(',');
        
            CheckObservationsVisitor vistor = new CheckObservationsVisitor();
            new ObservationTraverser(oVariable).traverse(vistor);
            for (Map.Entry<Integer, List<Float>> entry : observationMap.entrySet()) {
                writer.write(csvJoiner.join(entry.getKey(), entry.getValue().size()));
                writer.newLine();
            }
            System.out.println(
                    "Station Count: " + vistor.stationCount + 
                    " : TimeCountMin " + vistor.stationTimeCountMin +
                    " : TimeCountMax " + vistor.stationTimeCountMax +
                    " : RecordCount " + vistor.recordCount
                    );
            System.out.println((System.currentTimeMillis() - start) + "ms");
            
            generatePivotFile();
        } finally {
            if (writer != null) try { writer.close(); } catch (Exception e) {}
        }
    }
    
    
    protected void generatePivotFile() throws IOException, InvalidRangeException {
        NetcdfFileWriter ncWriter = NetcdfFileWriter.createNew(NetcdfFileWriter.Version.netcdf3, "out.nc");
        
        Dimension nStationDim = ncWriter.addDimension(null, "station", 114041);
        Dimension nStationIdLenDim = ncWriter.addDimension(null, "station_id_len", 9);
        Dimension nTimeDim = ncWriter.addDimension(null, "time", 708);
        
        Variable nStationIdVar = ncWriter.addVariable(null, "station_id", DataType.CHAR, Arrays.asList(nStationDim, nStationIdLenDim));
        nStationIdVar.addAttribute(new Attribute(CF.STANDARD_NAME, CF.STATION_ID));
        nStationIdVar.addAttribute(new Attribute(CF.CF_ROLE, CF.TIMESERIES_ID));

        Variable nTimeVar = ncWriter.addVariable(null, "time", DataType.INT, Arrays.asList(nTimeDim));
        nTimeVar.addAttribute(new Attribute(CF.STANDARD_NAME, "time"));
        nTimeVar.addAttribute(new Attribute(CDM.UNITS, "days since 1950-10-01T00:00:00.000Z"));
        nTimeVar.addAttribute(new Attribute(CF.CALENDAR, "gregorian"));
        
        Variable nLatVar = ncWriter.addVariable(null, "lat", DataType.FLOAT, Arrays.asList(nStationDim));
        nLatVar.addAttribute(new Attribute(CF.STANDARD_NAME, "latitude"));
        nLatVar.addAttribute(new Attribute(CDM.UNITS, CDM.LAT_UNITS));
        
        Variable nLonVar = ncWriter.addVariable(null, "lon", DataType.FLOAT, Arrays.asList(nStationDim));
        nLonVar.addAttribute(new Attribute(CF.STANDARD_NAME, "longitude"));
        nLonVar.addAttribute(new Attribute(CDM.UNITS, CDM.LON_UNITS));
        
        Variable nQAccConVar = ncWriter.addVariable(null, "QAccCon", DataType.FLOAT, Arrays.asList(nStationDim, nTimeDim));
        nQAccConVar.addAttribute(new Attribute(CF.COORDINATES, "time lat lon"));
        nQAccConVar.addAttribute(new Attribute(CDM.FILL_VALUE, Float.valueOf(-1f)));
        
        ncWriter.addGroupAttribute(null, new Attribute(CDM.CONVENTIONS, "CF-1.6"));
        ncWriter.addGroupAttribute(null, new Attribute(CF.FEATURE_TYPE, "timeSeries"));
        
        ncWriter.setFill(true);
        
        ncWriter.create();
        
        ncWriter.write(nStationIdVar, ncInput.findVariable("station_id").read());
        ncWriter.write(nLonVar, ncInput.findVariable("lat").read());
        ncWriter.write(nLatVar, ncInput.findVariable("lon").read());
        
        Array nTimeArray = Array.factory(DataType.INT, new int[] { 708 } );
        DateTime baseDateTime = DateTime.parse("1950-10-01T00:00:00.000Z");
        DateTime currentDateTime = baseDateTime;
        for (int tIndex = 0; tIndex < 708; ++tIndex) {
            nTimeArray.setInt(tIndex, Days.daysBetween(baseDateTime, currentDateTime).getDays());
            currentDateTime = currentDateTime.plusMonths(1);
        }
        ncWriter.write(nTimeVar, nTimeArray);
        
        for (Map.Entry<Integer, List<Float>> entry : observationMap.entrySet()) {
            int stationIndex = entry.getKey();
            List<Float> values = entry.getValue();
            int timeMissing = 708 - values.size();
            Array valueArray = Array.factory(DataType.FLOAT, new int[] { 1, 708 - timeMissing} );
            int valueArrayIndex = 0;
            for (float value : values) {
                valueArray.setFloat(valueArrayIndex++, value);
            }
            ncWriter.write(nQAccConVar, new int[] { stationIndex, timeMissing }, valueArray);
        }
        
        ncWriter.close();
    }
    
    public class CheckObservationsVisitor extends AbstractObservationVisitor {
        
        private int stationIndexLast;
        private int stationCount;
        
        private int stationTimeCountMin = Integer.MAX_VALUE;
        private int stationTimeCountMax = Integer.MIN_VALUE;
        private ArrayList<Float> stationTimeSeries = null;
        
        private int recordCount;

        ObservationVisitor delgate = new PrimingVisitor();
        
        @Override public void observation(int stationIndex, int timeIndex, float value) {
            delgate.observation(stationIndex, timeIndex, value);
        }
        @Override public void finish() {
            delgate.finish();
        }
        
        public class PrimingVisitor extends AbstractObservationVisitor {
            @Override public void observation(int stationIndex, int timeIndex, float value) {
                initStationData(stationIndex);
                recordCount++;
                delgate = new CountingVisitor();
            }
        }
        public class CountingVisitor extends AbstractObservationVisitor {
            @Override public void observation(int stationIndex, int timeIndex, float value) {
                if (stationIndexLast != stationIndex) {
                    processStationData();
                    initStationData(stationIndex);
                }
                stationTimeSeries.add(value);
                recordCount++;
            }
            @Override public void finish() {
                processStationData();
            }
        }    
        private void processStationData() {
            stationTimeSeries.trimToSize();
            observationMap.put(stationIndexLast, stationTimeSeries);
            int stationTimeCount = stationTimeSeries.size();
            if (stationTimeCount < stationTimeCountMin) {
                stationTimeCountMin = stationTimeCount;
            }
            if (stationTimeCount > stationTimeCountMax) {
                stationTimeCountMax = stationTimeCount;
            }
        }
        private void initStationData(int stationIndex) {
            stationIndexLast = stationIndex;
            stationCount++;
            stationTimeSeries = new ArrayList<Float>();
        }
    }
    
    public static void main(String[] args) throws Exception {

        NetcdfFile nc = null;
        try {
            nc = NetcdfFile.open("/Users/tkunicki/Data/GLRI/SOS/afinch.nc");

            new Pivoter(nc).pivot();
            
        } finally {
            if (nc != null) {
                nc.close();
            }
        }
    }
}
