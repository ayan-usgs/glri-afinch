package gov.usgs.cida.glri.afinch;

/**
 *
 * @author tkunicki
 */
public abstract class AbstractObservationVisitor implements ObservationVisitor {

    @Override
    public void start(long observationCount) { }

    @Override
    public void finish() { }
    
}
