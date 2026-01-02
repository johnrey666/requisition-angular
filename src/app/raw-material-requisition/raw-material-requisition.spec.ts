import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RawMaterialRequisitionComponent } from './raw-material-requisition';

describe('RawMaterialRequisitionComponent', () => {
  let component: RawMaterialRequisitionComponent;
  let fixture: ComponentFixture<RawMaterialRequisitionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RawMaterialRequisitionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RawMaterialRequisitionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});